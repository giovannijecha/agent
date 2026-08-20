#!/usr/bin/env node

import {
  arch,
  argv,
  cwd,
  env,
  exit,
  hrtime,
  platform,
  stderr,
  stdin,
  stdout,
  type WritableStream,
} from "node:process";

import {
  isOllamaCloudModelId,
  OllamaCloudModel,
  type OllamaCloudError,
} from "@agent/provider-ollama-cloud";
import { AgentRuntime } from "@agent/runtime";

import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import { runAuthCommand, type AuthCommandError } from "./auth-command.js";
import { createBuiltinToolEngine } from "./builtin-tools.js";
import {
  openOllamaCredentialSnapshot,
  type OllamaCredentialAdmission,
} from "./credential-broker.js";
import {
  EvaluationReceiptRecorder,
  formatEvaluationReceipt,
  planEvaluationExit,
  type EvaluationExitDiagnostic,
  type EvaluationReceiptSettlementFailure,
} from "./evaluation-receipt.js";
import { parseLaunchCommand } from "./launch-command.js";
import { NodeTerminalHost } from "./node-terminal-host.js";
import { NodeOllamaCloudTransport } from "./node-ollama-cloud-transport.js";
import { NodeOllamaModelCatalog } from "./node-ollama-model-catalog.js";
import { PlatformClipboard } from "./platform-clipboard.js";
import { PlatformWorkspaceMutationCommitter } from "./platform-workspace-mutation.js";
import { PlatformWorkspaceNamespaceCommitter } from "./platform-workspace-namespace.js";
import { resolvePlatformWorkspaceRoots } from "./platform-workspace-roots.js";
import { NodeProcessRunner } from "./node-process-runner.js";
import { NodeTimerClock } from "./node-timer-clock.js";
import { NoticeScheduler } from "./notice-scheduler.js";
import { writeProcessText } from "./process-output.js";
import { ShellExecutionPolicy } from "./shell-execution-policy.js";
import {
  prepareSessionJournalRoot,
  resolveSessionJournalRoots,
  SessionJournal,
  type OpenedSessionJournal,
  type SessionJournalErrorKind,
} from "./session-journal.js";
import {
  ProviderSession,
  type ProviderDefinition,
} from "./provider-session.js";
import { run } from "./run.js";
import { MotionScheduler } from "./motion-scheduler.js";
import { WorkspaceBoundary } from "./workspace-boundary.js";
import { WorkspaceReadPolicy } from "./workspace-read-policy.js";

type ProviderError = OllamaCloudError;

async function writeAndExit(
  output: WritableStream,
  text: string,
  code: number,
): Promise<never> {
  await writeProcessText(output, text);
  exit(code);
}

async function closeSessionJournal(
  opened: OpenedSessionJournal | undefined,
): Promise<void> {
  if (opened === undefined) {
    return;
  }
  try {
    await opened.journal.close();
  } catch (_cause: unknown) {
    // The pending content-free launch failure remains authoritative.
  }
}

async function closeCredentialAdmission(
  admission: OllamaCredentialAdmission | undefined,
): Promise<boolean> {
  if (admission === undefined) return true;
  try {
    return (await admission.close()).ok;
  } catch (_cause: unknown) {
    return false;
  }
}

async function closeSessionAndExit(
  opened: OpenedSessionJournal | undefined,
  text: string,
  code: number,
): Promise<never> {
  await closeSessionJournal(opened);
  return writeAndExit(stderr, text, code);
}

function sessionJournalDiagnostic(kind: SessionJournalErrorKind): string {
  if (kind === "missing") {
    return "agent found no resumable session for this workspace\n";
  }
  if (kind === "active") {
    return "agent refused to resume an active session\n";
  }
  if (kind === "busy") {
    return "agent found session admission busy for this workspace\n";
  }
  if (kind === "limit") {
    return "agent could not retain another bounded session\n";
  }
  if (kind === "migration") {
    return "agent could not migrate legacy session state\n";
  }
  return "agent could not open the session journal\n";
}

function authDiagnostic(error: AuthCommandError): string {
  if (error.kind === "busy") {
    return "agent found Ollama Cloud authentication busy\n";
  }
  if (error.kind === "dualAuthority") {
    return "agent found conflicting Ollama Cloud credential authorities\n";
  }
  if (error.kind === "environmentAuthority") {
    return "agent auth requires AGENT_OLLAMA_API_KEY to be unset\n";
  }
  if (error.kind === "invalidCredential") {
    return "agent rejected the Ollama Cloud credential\n";
  }
  return "agent could not update Ollama Cloud authentication\n";
}

function monotonicMilliseconds(): number {
  return Number(hrtime.bigint() / 1_000_000n);
}

async function startEvaluation(
  recorder: EvaluationReceiptRecorder | undefined,
): Promise<void> {
  if (recorder === undefined) {
    return;
  }
  const started = recorder.start(monotonicMilliseconds());
  if (!started.ok) {
    await writeAndExit(stderr, "agent could not start evaluation receipt\n", 1);
  }
}

async function finishEvaluation(
  recorder: EvaluationReceiptRecorder | undefined,
): Promise<EvaluationReceiptSettlementFailure | undefined> {
  if (recorder === undefined) {
    return undefined;
  }
  const finished = recorder.finish(monotonicMilliseconds());
  if (!finished.ok) {
    return "complete";
  }
  let text: string;
  try {
    text = formatEvaluationReceipt(finished.value);
  } catch (_cause: unknown) {
    return "complete";
  }
  return (await writeProcessText(stdout, text)).ok ? undefined : "write";
}

function evaluationDiagnostic(
  diagnostic: EvaluationExitDiagnostic,
  productFailure: string | undefined,
): string {
  if (diagnostic === "product") {
    return "agent stopped after a " + (productFailure ?? "cleanup") + " failure\n";
  }
  return diagnostic === "receiptComplete"
    ? "agent could not complete evaluation receipt\n"
    : "agent could not write evaluation receipt\n";
}

async function settleEvaluationRun(
  productFailure: string | undefined,
  recorder: EvaluationReceiptRecorder | undefined,
): Promise<void> {
  const receiptFailure = await finishEvaluation(recorder);
  const diagnostics = planEvaluationExit(
    productFailure !== undefined,
    receiptFailure,
  );
  if (diagnostics.length === 0) {
    return;
  }
  await writeAndExit(
    stderr,
    diagnostics
      .map((diagnostic) => evaluationDiagnostic(diagnostic, productFailure))
      .join(""),
    1,
  );
}

const launch = parseLaunchCommand(argv.slice(2));
if (!launch.ok) {
  await writeAndExit(
    stderr,
    "usage: agent [--evaluation-receipt | --help | --version]\n" +
      "       agent auth\n" +
      "       agent resume --latest\n",
    2,
  );
} else if (launch.command === "help") {
  await writeAndExit(
    stdout,
    "agent - owned personal coding agent\n\n" +
      "usage: agent [--evaluation-receipt | --help | --version]\n" +
      "       agent auth\n" +
      "       agent resume --latest\n\n" +
      "Use agent auth to register, replace, or remove the owned Ollama " +
      "Cloud credential outside the conversation interface.\n\n" +
      "Use agent resume --latest to continue the newest settled session for " +
      "the exact current workspace.\n\n" +
      "Use --evaluation-receipt only for one interactive owned task " +
      "evaluation; it prints bounded content-free counts after cleanup.\n\n" +
      "Use /models to choose one authenticated provider and compatible " +
      "model for this process.\n",
    0,
  );
} else if (launch.command === "version") {
  await writeAndExit(stdout, "agent 0.1.0\n", 0);
}

if (
  launch.ok &&
  (launch.command === "auth" ||
    (launch.command === "run" && launch.evaluationReceipt) ||
    launch.command === "resume") &&
  (stdin.isTTY !== true || stdout.isTTY !== true)
) {
  await writeAndExit(
    stderr,
    launch.command === "auth"
      ? "agent auth requires TTY input and output\n"
      : launch.command === "resume"
      ? "agent resume requires TTY input and output\n"
      : "agent evaluation receipt requires TTY input and output\n",
    2,
  );
}

const platformRoots = await resolvePlatformWorkspaceRoots(platform, arch);
const workspaceProtection = platformRoots.ok
  ? platformRoots.value
  : await writeAndExit(stderr, "agent rejected the workspace root\n", 1);
const workspace = await WorkspaceBoundary.create(cwd(), workspaceProtection);
const workspaceBoundary = workspace.ok
  ? workspace.value
  : await writeAndExit(stderr, "agent rejected the workspace root\n", 1);
const workspaceRoot = workspaceBoundary.root;
const workspaceReadPolicyResult = await WorkspaceReadPolicy.load(
  workspaceBoundary,
  platform,
);
const workspaceReadPolicy = workspaceReadPolicyResult.ok
  ? workspaceReadPolicyResult.value
  : await writeAndExit(
      stderr,
      "agent rejected the workspace privacy policy\n",
      1,
    );

if (launch.ok && launch.command === "auth") {
  const authenticated = await runAuthCommand(
    platform,
    arch,
    env.AGENT_OLLAMA_API_KEY,
  );
  if (!authenticated.ok) {
    await writeAndExit(stderr, authDiagnostic(authenticated.error), 1);
  }
  await writeAndExit(stdout, "", 0);
}

const terminalHost = new NodeTerminalHost();
const timerClock = terminalHost.interactive ? new NodeTimerClock() : undefined;
const motion = timerClock !== undefined
  ? new MotionScheduler(timerClock)
  : undefined;
const notices = timerClock !== undefined
  ? new NoticeScheduler(timerClock)
  : undefined;
const clipboard = new PlatformClipboard(platform, arch);
const evaluation =
  launch.ok && launch.command === "run" && launch.evaluationReceipt
    ? new EvaluationReceiptRecorder()
    : undefined;
let openedSession: OpenedSessionJournal | undefined;
if (terminalHost.interactive && evaluation === undefined) {
  const stateRoots = resolveSessionJournalRoots(
    platform,
    env,
    workspaceProtection.homeDirectory,
  );
  const preparedState = stateRoots.ok
    ? await prepareSessionJournalRoot(stateRoots.value, workspaceRoot)
    : stateRoots;
  const sessionRoot = preparedState.ok
    ? preparedState.value.root
    : await writeAndExit(
        stderr,
        sessionJournalDiagnostic(preparedState.error.kind),
        1,
      );
  const opened = launch.ok && launch.command === "resume"
    ? await SessionJournal.resumeLatest(sessionRoot, workspaceRoot)
    : await SessionJournal.create(sessionRoot, workspaceRoot);
  openedSession = opened.ok
    ? opened.value
    : await writeAndExit(
        stderr,
        sessionJournalDiagnostic(opened.error.kind),
        1,
      );
}

const definitions: readonly ProviderDefinition<ProviderError>[] = Object.freeze([
  Object.freeze({
    acceptsModel: isOllamaCloudModelId,
    createModel: (credential: string, model: string) => {
      if (!isOllamaCloudModelId(model)) return undefined;
      const transport = NodeOllamaCloudTransport.create(credential);
      if (!transport.ok) return undefined;
      const created = OllamaCloudModel.create(
        transport.value,
        AGENT_INSTRUCTIONS,
        model,
      );
      return created.ok ? created.value : undefined;
    },
    id: "ollamaCloud" as const,
    presentation: Object.freeze({
      authentication: "owned credential",
      displayName: "Ollama Cloud",
    }),
  }),
]);
const providerSession = ProviderSession.create(
  definitions,
  new NodeOllamaModelCatalog(),
);
const processRunner = NodeProcessRunner.create(platform, arch);
const shell = ShellExecutionPolicy.create(platform, env);
const mutationCommitter = PlatformWorkspaceMutationCommitter.create(
  platform,
  arch,
);
const namespaceCommitter = PlatformWorkspaceNamespaceCommitter.create(
  platform,
  arch,
);
const initializedProviderSession = providerSession.ok
  ? providerSession.value
  : await closeSessionAndExit(
      openedSession,
      "agent could not initialize the configured provider\n",
      1,
    );
const initializedProcessRunner = processRunner.ok
  ? processRunner.value
  : await closeSessionAndExit(
      openedSession,
      "agent could not initialize the configured provider\n",
      1,
    );
const initializedShell = shell.ok
  ? shell.value
  : await closeSessionAndExit(
      openedSession,
      "agent could not initialize the configured provider\n",
      1,
    );
const initializedMutationCommitter = mutationCommitter.ok
  ? mutationCommitter.value
  : await closeSessionAndExit(
      openedSession,
      "agent could not initialize the configured provider\n",
      1,
    );
const initializedNamespaceCommitter = namespaceCommitter.ok
  ? namespaceCommitter.value
  : await closeSessionAndExit(
      openedSession,
      "agent could not initialize the configured provider\n",
      1,
    );

const tools = createBuiltinToolEngine(
  workspaceBoundary,
  workspaceReadPolicy,
  {
    mutationCommitter: initializedMutationCommitter,
    namespaceCommitter: initializedNamespaceCommitter,
    processRunner: initializedProcessRunner,
    shell: initializedShell,
  },
  evaluation,
);
const initializedTools = tools.ok
  ? tools.value
  : await closeSessionAndExit(
      openedSession,
      "agent could not initialize the configured provider\n",
      1,
    );

await startEvaluation(evaluation);
const credentialSnapshot = terminalHost.interactive
  ? await openOllamaCredentialSnapshot(
      platform,
      arch,
      env.AGENT_OLLAMA_API_KEY,
    )
  : undefined;
const snapshot = credentialSnapshot === undefined || credentialSnapshot.ok
  ? credentialSnapshot?.value
  : await closeSessionAndExit(
      openedSession,
      credentialSnapshot.error.kind === "busy"
        ? "agent found Ollama Cloud authentication busy\n"
        : credentialSnapshot.error.kind === "dualAuthority"
          ? "agent found conflicting Ollama Cloud credential authorities\n"
          : "agent rejected the provider configuration\n",
      1,
    );
const ollamaAdmitted = snapshot === undefined ||
  snapshot.configuration.kind === "disabled" ||
  initializedProviderSession.admit(
    "ollamaCloud",
    snapshot.configuration.credential,
    snapshot.admission,
  ).ok;
if (!ollamaAdmitted) {
  await closeCredentialAdmission(snapshot?.admission);
  await closeSessionAndExit(
    openedSession,
    "agent rejected the provider configuration\n",
    1,
  );
}
const runtime = new AgentRuntime(
  initializedProviderSession,
  initializedTools,
  openedSession?.history,
);
const result = await run(
  terminalHost,
  runtime,
  initializedProviderSession,
  workspaceRoot,
  motion,
  notices,
  clipboard,
  evaluation,
  runtime,
  openedSession?.journal,
  openedSession?.chat,
  openedSession?.recoveredState ?? false,
);
const credentialClosed = await closeCredentialAdmission(snapshot?.admission);
await settleEvaluationRun(
  result.ok && credentialClosed
    ? undefined
    : result.ok
      ? "credential cleanup"
      : result.error.primary?.kind ?? "cleanup",
  evaluation,
);
