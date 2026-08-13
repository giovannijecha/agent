import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { projectRoot } from "./lib/project.mjs";

const minimumClangMajor = 18;
const processBrokerRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/process-broker",
);
const workspaceRootsRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/workspace-roots",
);

function runCompiler(arguments_) {
  const result = spawnSync("clang", arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error !== undefined) {
    throw new Error("the registered native compiler could not be started");
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error("the owned native build failed");
  }
  return result.stdout;
}

if (process.arch !== "x64" || !["linux", "win32"].includes(process.platform)) {
  throw new Error("native process containment is supported only on Windows x64 and Linux x64");
}

const versionText = runCompiler(["--version"]);
const versionMatch = /\bclang version ([0-9]+)\./u.exec(versionText);
if (versionMatch === null || Number(versionMatch[1]) < minimumClangMajor) {
  throw new Error("the registered native compiler is older than Clang 18");
}

const platformDirectory = process.platform + "-x64";
const outputDirectory = path.join(
  projectRoot,
  "packages/agent-cli/.native-build",
  platformDirectory,
);
mkdirSync(outputDirectory, { recursive: true });

const commonFlags = [
  "-std=c17",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-pedantic",
  "-O2",
  "-fno-common",
  "-fstack-protector-strong",
  "-D_FORTIFY_SOURCE=2",
];
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const platformFlags = process.platform === "win32"
  ? [
      "-D_WIN32_WINNT=0x0A00",
      "-DUNICODE",
      "-D_UNICODE",
      "-Wl,--dynamicbase",
      "-Wl,--nxcompat",
      "-Wl,--high-entropy-va",
    ]
  : [
      "-D_GNU_SOURCE",
      "-fPIE",
      "-pie",
      "-Wl,-z,relro",
      "-Wl,-z,now",
    ];
const backend = process.platform === "win32"
  ? "backend-windows.c"
  : "backend-linux.c";

runCompiler([
  ...commonFlags,
  ...platformFlags,
  path.join(processBrokerRoot, "main.c"),
  path.join(processBrokerRoot, "protocol.c"),
  path.join(processBrokerRoot, backend),
  "-o",
  path.join(outputDirectory, "agent-process-broker" + executableSuffix),
]);

runCompiler([
  ...commonFlags,
  ...platformFlags,
  ...(process.platform === "win32" ? ["-municode"] : []),
  path.join(processBrokerRoot, "test-fixture.c"),
  "-o",
  path.join(outputDirectory, "agent-process-fixture" + executableSuffix),
]);

runCompiler([
  ...commonFlags,
  ...platformFlags,
  path.join(workspaceRootsRoot, "main.c"),
  path.join(workspaceRootsRoot, backend),
  ...(process.platform === "win32"
    ? ["-lshell32", "-lole32", "-luuid"]
    : []),
  "-o",
  path.join(outputDirectory, "agent-workspace-roots" + executableSuffix),
]);

process.stdout.write("Built owned native executables for " + platformDirectory + ".\n");
