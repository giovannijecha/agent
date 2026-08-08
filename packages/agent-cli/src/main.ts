import { exit, stderr } from "node:process";

import { NodeTerminalHost } from "./node-terminal-host.js";
import { run } from "./run.js";

const result = await run(new NodeTerminalHost());
if (!result.ok) {
  const label = result.error.primary?.kind ?? "cleanup";
  stderr.write("agent stopped after a " + label + " failure\n", () => exit(1));
}
