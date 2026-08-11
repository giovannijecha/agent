#!/usr/bin/env node

import path from "node:path";
import {
  argv,
  cwd,
  env,
  exit,
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
import { resolveOpenCodeGoConfiguration } from "./provider-configuration.js";
import { run } from "./run.js";
import { acquireOpenCodeGoCredential } from "./startup-credential.js";

const PROVIDER_PRESENTATION: ProviderPresentation = Object.freeze({
  authentication: "memory-only API key",
  displayName: "OpenCode Go",
  model: OPENCODE_GO_MODEL,
});

const workspaceRoot = cwd();
const workspaceName = path.basename(workspaceRoot);
const workspaceLabel =
  workspaceName.length === 0 ? workspaceRoot : "./" + workspaceName;

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
if (!configuration.ok) {
  stderr.write("agent rejected the provider configuration\n", () => exit(1));
} else if (configuration.value.kind === "disabled") {
  const result = await run(
    new NodeTerminalHost(),
    undefined,
    undefined,
    workspaceLabel,
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
  const tools = createBuiltinToolEngine(workspaceRoot);
  if (!model.ok || !tools.ok) {
    stderr.write("agent could not initialize the configured provider\n", () =>
      exit(1),
    );
  } else {
    const result = await run(
      new NodeTerminalHost(),
      new AgentRuntime(model.value, tools.value),
      PROVIDER_PRESENTATION,
      workspaceLabel,
    );
    if (!result.ok) {
      const label = result.error.primary?.kind ?? "cleanup";
      stderr.write("agent stopped after a " + label + " failure\n", () =>
        exit(1),
      );
    }
  }
}
