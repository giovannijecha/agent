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
import { createBuiltinToolEngine } from "./builtin-tools.js";
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
import { resolveOllamaCloudConfiguration } from "./provider-configuration.js";
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
    "usage: agent [--evaluation-receipt | --help | --version]\n",
    2,
  );
} else if (launch.command === "help") {
  await writeAndExit(
    stdout,
    "agent - owned personal coding agent\n\n" +
      "usage: agent [--evaluation-receipt | --help | --version]\n\n" +
      "Use --evaluation-receipt only for one interactive owned task " +
      "evaluation; it prints bounded content-free counts after cleanup.\n\n" +
      "Use /providers to configure or select a memory-only provider, then " +
      "use /models to choose one compatible model for this process.\n",
    0,
  );
} else if (launch.command === "version") {
  await writeAndExit(stdout, "agent 0.1.0\n", 0);
}

if (
  launch.ok &&
  launch.command === "run" &&
  launch.evaluationReceipt &&
  (stdin.isTTY !== true || stdout.isTTY !== true)
) {
  await writeAndExit(
    stderr,
    "agent evaluation receipt requires TTY input and output\n",
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

const ollamaConfiguration = resolveOllamaCloudConfiguration(
  env.AGENT_OLLAMA_API_KEY,
);
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
if (!ollamaConfiguration.ok) {
  stderr.write("agent rejected the provider configuration\n", () => exit(1));
} else {
  const definitions: readonly ProviderDefinition<ProviderError>[] =
    Object.freeze([
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
          authentication: "memory-only API key",
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
  if (
    !providerSession.ok ||
    !processRunner.ok ||
    !shell.ok ||
    !mutationCommitter.ok ||
    !namespaceCommitter.ok
  ) {
    stderr.write("agent could not initialize the configured provider\n", () =>
      exit(1),
    );
  } else {
    const ollamaPreloaded = ollamaConfiguration.value.kind === "disabled" ||
      providerSession.value.configure(
        "ollamaCloud",
        ollamaConfiguration.value.credential,
      ).ok;
    if (!ollamaPreloaded) {
      stderr.write("agent rejected the provider configuration\n", () =>
        exit(1),
      );
    } else {
      const tools = createBuiltinToolEngine(
        workspaceBoundary,
        workspaceReadPolicy,
        {
          mutationCommitter: mutationCommitter.value,
          namespaceCommitter: namespaceCommitter.value,
          processRunner: processRunner.value,
          shell: shell.value,
        },
        evaluation,
      );
      if (!tools.ok) {
        stderr.write(
          "agent could not initialize the configured provider\n",
          () => exit(1),
        );
      } else {
        await startEvaluation(evaluation);
        const result = await run(
          terminalHost,
          new AgentRuntime(providerSession.value, tools.value),
          providerSession.value,
          workspaceRoot,
          motion,
          notices,
          clipboard,
          evaluation,
        );
        await settleEvaluationRun(
          result.ok ? undefined : result.error.primary?.kind ?? "cleanup",
          evaluation,
        );
      }
    }
  }
}
