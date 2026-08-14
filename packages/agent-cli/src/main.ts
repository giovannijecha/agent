#!/usr/bin/env node

import {
  arch,
  argv,
  cwd,
  env,
  exit,
  execPath,
  platform,
  stderr,
  stdin,
  stdout,
  type WritableStream,
} from "node:process";

import { OpenCodeGoModel, OPENCODE_GO_MODEL } from "@agent/provider-opencode-go";
import { AgentRuntime } from "@agent/runtime";

import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import { createBuiltinToolEngine } from "./builtin-tools.js";
import type { ProviderPresentation } from "./commands.js";
import { readHiddenOpenCodeGoCredential } from "./hidden-credential-prompt.js";
import { parseLaunchCommand } from "./launch-command.js";
import { NodeTerminalHost } from "./node-terminal-host.js";
import { NodeOpenCodeGoTransport } from "./node-opencode-go-transport.js";
import { PlatformClipboard } from "./platform-clipboard.js";
import { PlatformWorkspaceMutationCommitter } from "./platform-workspace-mutation.js";
import { resolvePlatformWorkspaceRoots } from "./platform-workspace-roots.js";
import { NodeProcessRunner } from "./node-process-runner.js";
import { NodeTimerClock } from "./node-timer-clock.js";
import { NoticeScheduler } from "./notice-scheduler.js";
import { resolveOpenCodeGoConfiguration } from "./provider-configuration.js";
import { run } from "./run.js";
import { MotionScheduler } from "./motion-scheduler.js";
import { acquireOpenCodeGoCredential } from "./startup-credential.js";
import { WorkspaceBoundary } from "./workspace-boundary.js";
import { WorkspaceReadPolicy } from "./workspace-read-policy.js";

const PROVIDER_PRESENTATION: ProviderPresentation = Object.freeze({
  authentication: "memory-only API key",
  displayName: "OpenCode Go",
  model: OPENCODE_GO_MODEL,
});

async function writeAndExit(
  output: WritableStream,
  text: string,
  code: number,
): Promise<never> {
  await new Promise<void>((resolve) => {
    try {
      output.write(text, () => resolve());
    } catch (_cause: unknown) {
      resolve();
    }
  });
  exit(code);
}

const launch = parseLaunchCommand(argv.slice(2));
if (!launch.ok) {
  await writeAndExit(stderr, "usage: agent [--help | --version]\n", 2);
} else if (launch.command === "help") {
  await writeAndExit(
    stdout,
    "agent - owned personal coding agent\n\n" +
      "usage: agent [--help | --version]\n\n" +
      "Without a configured credential, interactive startup asks for the " +
      "OpenCode Go API key with terminal echo disabled. Press Enter to " +
      "continue without a model.\n",
    0,
  );
} else if (launch.command === "version") {
  await writeAndExit(stdout, "agent 0.1.0\n", 0);
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

const credential = await acquireOpenCodeGoCredential(
  env.AGENT_OPENCODE_GO_API_KEY,
  launch.ok &&
    launch.command === "run" &&
    stdin.isTTY === true &&
    stdout.isTTY === true,
  () => readHiddenOpenCodeGoCredential(stdin, stdout),
  (diagnostic, code) => writeAndExit(stderr, diagnostic, code),
);

const configuration = resolveOpenCodeGoConfiguration(
  credential,
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
if (!configuration.ok) {
  stderr.write("agent rejected the provider configuration\n", () => exit(1));
} else if (configuration.value.kind === "disabled") {
  const result = await run(
    terminalHost,
    undefined,
    undefined,
    workspaceRoot,
    motion,
    notices,
    clipboard,
  );
  if (!result.ok) {
    const label = result.error.primary?.kind ?? "cleanup";
    stderr.write("agent stopped after a " + label + " failure\n", () => exit(1));
  }
} else {
  const transport = NodeOpenCodeGoTransport.create(
    configuration.value.credential,
  );
  const model = transport.ok
    ? OpenCodeGoModel.create(transport.value, AGENT_INSTRUCTIONS)
    : transport;
  const processRunner = NodeProcessRunner.create(platform, arch);
  const mutationCommitter = PlatformWorkspaceMutationCommitter.create(
    platform,
    arch,
  );
  if (!model.ok || !processRunner.ok || !mutationCommitter.ok) {
    stderr.write("agent could not initialize the configured provider\n", () =>
      exit(1),
    );
  } else {
    const tools = createBuiltinToolEngine(
      workspaceBoundary,
      workspaceReadPolicy,
      {
        mutationCommitter: mutationCommitter.value,
        nodeExecutable: execPath,
        processRunner: processRunner.value,
      },
    );
    if (!tools.ok) {
      stderr.write("agent could not initialize the configured provider\n", () =>
        exit(1),
      );
    } else {
      const result = await run(
        terminalHost,
        new AgentRuntime(model.value, tools.value),
        PROVIDER_PRESENTATION,
        workspaceRoot,
        motion,
        notices,
        clipboard,
      );
      if (!result.ok) {
        const label = result.error.primary?.kind ?? "cleanup";
        stderr.write("agent stopped after a " + label + " failure\n", () =>
          exit(1),
        );
      }
    }
  }
}
