import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { projectRoot } from "./lib/project.mjs";

const minimumClangMajor = 18;
const clipboardRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/clipboard",
);
const credentialBrokerRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/credential-broker",
);
const processBrokerRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/process-broker",
);
const mutationCommitRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/mutation-commit",
);
const namespaceCommitRoot = path.join(
  projectRoot,
  "packages/agent-cli/native/namespace-commit",
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
  path.join(credentialBrokerRoot, "main.c"),
  path.join(credentialBrokerRoot, "credential-store.c"),
  ...(process.platform === "win32"
    ? [
        path.join(credentialBrokerRoot, "lineage-windows.c"),
        "-ladvapi32",
        "-lshell32",
        "-lole32",
        "-luuid",
      ]
    : []),
  "-o",
  path.join(outputDirectory, "agent-credential-broker" + executableSuffix),
]);

runCompiler([
  ...commonFlags,
  ...platformFlags,
  "-DAGENT_CREDENTIAL_FIXTURE",
  path.join(credentialBrokerRoot, "main.c"),
  path.join(credentialBrokerRoot, "credential-store.c"),
  ...(process.platform === "win32"
    ? [
        path.join(credentialBrokerRoot, "lineage-windows.c"),
        "-ladvapi32",
        "-lshell32",
        "-lole32",
        "-luuid",
      ]
    : []),
  "-o",
  path.join(outputDirectory, "agent-credential-fixture" + executableSuffix),
]);

if (process.platform === "win32") {
  runCompiler([
    ...commonFlags,
    ...platformFlags,
    path.join(credentialBrokerRoot, "profile-owner-fixture.c"),
    path.join(credentialBrokerRoot, "lineage-windows.c"),
    "-ladvapi32",
    "-lshell32",
    "-lole32",
    "-luuid",
    "-o",
    path.join(outputDirectory, "agent-credential-profile-fixture.exe"),
  ]);
}

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

runCompiler([
  ...commonFlags,
  ...platformFlags,
  path.join(mutationCommitRoot, "main.c"),
  path.join(mutationCommitRoot, "protocol.c"),
  path.join(mutationCommitRoot, backend),
  "-o",
  path.join(outputDirectory, "agent-mutation-commit" + executableSuffix),
]);

runCompiler([
  ...commonFlags,
  ...platformFlags,
  path.join(namespaceCommitRoot, "main.c"),
  path.join(namespaceCommitRoot, "protocol.c"),
  path.join(namespaceCommitRoot, backend),
  "-o",
  path.join(outputDirectory, "agent-namespace-commit" + executableSuffix),
]);

runCompiler([
  ...commonFlags,
  ...platformFlags,
  path.join(clipboardRoot, "main.c"),
  path.join(clipboardRoot, "protocol.c"),
  path.join(clipboardRoot, "backend-fixture.c"),
  "-o",
  path.join(outputDirectory, "agent-clipboard-fixture" + executableSuffix),
]);

if (process.platform === "win32") {
  runCompiler([
    ...commonFlags,
    ...platformFlags,
    path.join(clipboardRoot, "main.c"),
    path.join(clipboardRoot, "protocol.c"),
    path.join(clipboardRoot, "backend-windows.c"),
    "-luser32",
    "-o",
    path.join(outputDirectory, "agent-clipboard.exe"),
  ]);
}

process.stdout.write("Built owned native executables for " + platformDirectory + ".\n");
