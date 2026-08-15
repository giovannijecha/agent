import { spawnSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { analyzeModule } from "./lib/module-specifiers.mjs";
import { validateBrandPolicy } from "./lib/brand-policy.mjs";
import { validateCiPolicy } from "./lib/ci-policy.mjs";
import {
  EVALUATION_FAILURE_LIMITS,
  parseEvaluationFailureRegistry,
  validateEvaluationFailureRegistry,
} from "./lib/evaluation-failure-registry.mjs";
import { validateEvaluationSuite } from "./lib/evaluation-suite.mjs";
import { validateManualPolicy } from "./lib/manual-policy.mjs";
import { validateProviderPolicy } from "./lib/provider-policy.mjs";
import { validatePublicationPolicy } from "./lib/publication-policy.mjs";
import {
  isIgnoredRepositorySourceDirectory,
  readBoundedRegularSourceFile,
} from "./lib/repository-source-boundary.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);
if (
  arguments_.length > 1 ||
  (arguments_.length === 1 && arguments_[0] !== "--require-generated")
) {
  throw new Error("usage: node tools/verify.mjs [--require-generated]");
}
const requireGenerated = arguments_[0] === "--require-generated";
const brandManifest = readJson("assets/brand/manifest.json");
const ciPolicy = readJson("tools/ci-policy.json");
const evaluationPolicy = readJson("tools/evaluation-policy.json");
const policy = readJson("tools/ownership-policy.json");
const manualPolicy = readJson("tools/manual-policy.json");
const providerPolicy = readJson("tools/provider-policy.json");
const publicationPolicy = readJson("tools/publication-policy.json");
const toolchain = readJson("tools/toolchain.json");
let evaluationOwnedPaths = new Set();
const workspaceByName = new Map(
  policy.workspaces.map((workspace) => [workspace.name, workspace]),
);
const generatedDirectories = new Set(
  policy.workspaces.flatMap((workspace) => [
    workspace.path + "/dist",
    workspace.path + "/.test-dist",
  ]).concat(["packages/agent-cli/.native-build"]),
);
const reservedDirectoryNames = new Set([
  ".cargo",
  ".native-build",
  ".git",
  ".test-dist",
  "dist",
  "node_modules",
  "target",
]);
const dependencyFields = [
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bundledDependencies",
  "overrides",
];
const lifecycleScripts = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "prepublish",
  "prepublishOnly",
];

function fail(message) {
  throw new Error(message);
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function absolute(relativePath) {
  const resolved = path.resolve(projectRoot, relativePath);
  if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) {
    fail("path escaped the project: " + relativePath);
  }
  return resolved;
}

function readText(relativePath) {
  const bytes = readFileSync(absolute(relativePath));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("file is not valid UTF-8: " + relativePath);
  }
}

function readJson(relativePath) {
  const text = readText(relativePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("invalid JSON in " + relativePath + ": " + String(error));
  }
}

function listFiles(relativeDirectory, includeGenerated = false) {
  const directory = absolute(relativeDirectory);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativeEntry = normalize(path.join(relativeDirectory, entry.name));
    if (entry.isSymbolicLink()) {
      fail("symlink is forbidden in owned source: " + relativeEntry);
    }
    if (entry.isDirectory()) {
      if (isIgnoredRepositorySourceDirectory(relativeEntry)) {
        continue;
      }
      if (generatedDirectories.has(relativeEntry)) {
        if (includeGenerated) {
          files.push(...listFiles(relativeEntry, true));
        }
        continue;
      }
      if (reservedDirectoryNames.has(entry.name)) {
        fail("reserved directory has an unapproved location: " + relativeEntry);
      }
      files.push(...listFiles(relativeEntry, includeGenerated));
    } else if (entry.isFile()) {
      files.push(relativeEntry);
    }
  }
  return files;
}

function compareObjects(actual, expected, label) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    fail(label + " mismatch: expected " + expectedText + ", got " + actualText);
  }
}

function parseVersion(version, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version.trim());
  if (match === null) {
    fail(label + " is not a stable semantic version: " + version);
  }
  return match.slice(1).map((part) => Number(part));
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function captureTool(program, arguments_) {
  const windowsCommandShim = process.platform === "win32" &&
    (program === "npm" || program === "tsc");
  const result = windowsCommandShim
    ? spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", program + " " + arguments_.join(" ")],
        {
          cwd: projectRoot,
          encoding: "utf8",
          shell: false,
        },
      )
    : spawnSync(program, arguments_, {
        cwd: projectRoot,
        encoding: "utf8",
        shell: false,
      });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail("tool command failed: " + program);
  }
  return result.stdout.trim();
}

function verifyToolchain() {
  const nodeVersion = process.versions.node;
  if (
    compareVersions(
      parseVersion(nodeVersion, "Node"),
      parseVersion(toolchain.node.minimumVersion, "minimum Node"),
    ) < 0
  ) {
    fail("Node is too old: " + nodeVersion);
  }

  const npmVersion = captureTool("npm", ["--version"]);
  if (npmVersion !== toolchain.npm.exactVersion) {
    fail(
      "npm version mismatch: expected " +
        toolchain.npm.exactVersion +
        ", got " +
        npmVersion,
    );
  }

  const typescriptVersion = captureTool("tsc", ["--version"]).replace(/^Version\s+/u, "");
  if (typescriptVersion !== toolchain.typescript.exactVersion) {
    fail(
      "TypeScript version mismatch: expected " +
        toolchain.typescript.exactVersion +
        ", got " +
        typescriptVersion,
    );
  }

  const locator = process.platform === "win32" ? "where.exe" : "which";
  const located = spawnSync(locator, ["tsc"], { encoding: "utf8" });
  if (located.status !== 0) {
    fail("TypeScript compiler is not locatable from PATH");
  }
  for (const compilerPath of located.stdout.trim().split(/\r?\n/u)) {
    if (path.resolve(compilerPath).startsWith(projectRoot + path.sep)) {
      fail("TypeScript must remain outside the repository: " + compilerPath);
    }
  }

  if (
    toolchain.nativeC.languageStandard !== "c17" ||
    toolchain.nativeC.compiler !== "clang" ||
    !toolchain.nativeC.platforms.includes(process.platform) ||
    !toolchain.nativeC.architectures.includes(process.arch)
  ) {
    fail("the current platform is outside the registered native C toolchain");
  }
  const clangVersion = captureTool(toolchain.nativeC.compiler, ["--version"]);
  const clangMatch = /\bclang version ([0-9]+)\./u.exec(clangVersion);
  if (
    clangMatch === null ||
    Number(clangMatch[1]) < toolchain.nativeC.minimumMajorVersion
  ) {
    fail("Clang is older than the registered native minimum");
  }
  const locatedClang = spawnSync(locator, [toolchain.nativeC.compiler], {
    encoding: "utf8",
  });
  if (locatedClang.status !== 0) {
    fail("native C compiler is not locatable from PATH");
  }
  for (const compilerPath of locatedClang.stdout.trim().split(/\r?\n/u)) {
    if (path.resolve(compilerPath).startsWith(projectRoot + path.sep)) {
      fail("native C compiler must remain outside the repository: " + compilerPath);
    }
  }
}

function verifyDocuments() {
  for (const document of policy.requiredDocuments) {
    if (!lstatSync(absolute(document), { throwIfNoEntry: false })?.isFile()) {
      fail("required documentation is missing: " + document);
    }
  }
}

function verifyCiPolicy() {
  validateCiPolicy(ciPolicy, {
    workflowText: readText(ciPolicy.workflowPath),
    toolchain,
  });
}

function verifyBrandPolicy() {
  const ownedPaths = listFiles("assets/brand");
  validateBrandPolicy(brandManifest, {
    files: Object.fromEntries(
      ownedPaths.map((file) => [file, readFileSync(absolute(file))]),
    ),
    ownedPaths,
  });
}

function verifyEvaluationPolicy() {
  const root = "evaluations/";
  const failureRegistryPath = "evaluations/failures/registry.json";
  const ownedPaths = listFiles("evaluations");
  const failureRegistrySource = readBoundedRegularSourceFile(
    projectRoot,
    failureRegistryPath,
    EVALUATION_FAILURE_LIMITS.registryBytes,
  );
  const relativePaths = ownedPaths.map((file) => file.slice(root.length));
  const evaluationSuite = validateEvaluationSuite(evaluationPolicy, {
    files: new Map(
      ownedPaths
        .filter((file) => file !== failureRegistryPath)
        .map((file) => [
          file.slice(root.length),
          readFileSync(absolute(file)),
        ]),
    ),
    ownedPaths: relativePaths,
  });
  validateEvaluationFailureRegistry(
    parseEvaluationFailureRegistry(failureRegistrySource),
    {
      repositoryPaths: listFiles("."),
      sourceBytes: failureRegistrySource.length,
      taskExpectedPaths: evaluationSuite.tasks.map((task) => ({
        paths: task.expected.map((entry) => entry.path),
        taskId: task.id,
      })),
    },
  );
  evaluationOwnedPaths = new Set(ownedPaths);
}

function verifyManual() {
  const ownedPaths = listFiles(".");
  const manualPaths = ownedPaths.filter(
    (file) => file.startsWith("docs/manual/") && file.endsWith(".md"),
  );
  const productSources = ownedPaths.filter((file) =>
    /^packages\/[a-z0-9-]+\/src\/[a-z0-9-]+\.ts$/u.test(file),
  );
  const decisionPaths = ownedPaths.filter((file) =>
    /^docs\/decisions\/[0-9]{4}-[a-z0-9-]+\.md$/u.test(file),
  );
  const inputs = [
    "README.md",
    "PRIVACY.md",
    "docs/MAINTENANCE.md",
    ...productSources,
    ...manualPaths,
    ...decisionPaths,
  ];
  validateManualPolicy(manualPolicy, {
    files: Object.fromEntries(inputs.map((file) => [file, readText(file)])),
    manualPaths,
    ownedPaths,
  });
}

function verifyProviderPolicy() {
  const workspaceSources = policy.workspaces.flatMap((workspace) =>
    [workspace.path + "/src", workspace.path + "/test"].flatMap((directory) =>
      listFiles(directory)
        .filter((file) => file.endsWith(".ts"))
        .map((file) => ({ path: file, text: readText(file) })),
    ),
  );
  const declarationSources = listFiles("types")
    .filter((file) => file.endsWith(".d.ts"))
    .map((file) => ({ path: file, text: readText(file) }));
  const nativeSources = listFiles("packages/agent-cli/native")
    .filter((file) => /\.(?:c|h)$/u.test(file))
    .map((file) => ({ path: file, text: readText(file) }));
  validateProviderPolicy(providerPolicy, {
    workspaceNames: policy.workspaces.map((workspace) => workspace.name),
    productSources: [...workspaceSources, ...declarationSources, ...nativeSources],
    applicationText: readText(providerPolicy.applicationDocument),
  });
}

function verifyPublicationPolicy() {
  validatePublicationPolicy(publicationPolicy, {
    files: Object.fromEntries(
      publicationPolicy.documents.map((file) => [file, readText(file)]),
    ),
  });
}

function verifyManifests() {
  const rootManifest = readJson("package.json");
  compareObjects(
    Object.keys(rootManifest).sort(),
    ["bin", "engines", "name", "private", "scripts", "type", "version", "workspaces"],
    "root manifest keys",
  );
  if (
    rootManifest.name !== "agent-workspace" ||
    rootManifest.version !== "0.1.0" ||
    rootManifest.private !== true ||
    rootManifest.type !== "module"
  ) {
    fail("root package must be private ESM");
  }
  compareObjects(
    rootManifest.engines,
    { node: ">=22.19.0", npm: "11.16.0" },
    "root engines",
  );
  compareObjects(
    rootManifest.workspaces,
    policy.workspaces.map((workspace) => workspace.path),
    "workspace registry",
  );
  compareObjects(
    rootManifest.bin,
    { agent: "packages/agent-cli/dist/main.js" },
    "root executable",
  );
  for (const field of ["dependencies", ...dependencyFields]) {
    if (rootManifest[field] !== undefined) {
      fail("root dependency field is forbidden: " + field);
    }
  }
  for (const script of lifecycleScripts) {
    if (rootManifest.scripts?.[script] !== undefined) {
      fail("lifecycle script is forbidden: " + script);
    }
  }
  compareObjects(
    rootManifest.scripts,
    {
      build: "tsc --build tsconfig.json --pretty false && node tools/build-native.mjs",
      clean: "node tools/clean.mjs",
      dev: "npm run build && npm start",
      "install:command":
        "npm run build && npm link --ignore-scripts --no-audit --no-fund",
      start: "node packages/agent-cli/dist/main.js",
      test: "node tools/run-tests.mjs",
      verify: "powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1",
    },
    "root scripts",
  );

  const manifests = listFiles(".")
    .filter(
      (file) =>
        path.basename(file) === "package.json" &&
        !evaluationOwnedPaths.has(file),
    )
    .sort();
  const expectedManifests = [
    "package.json",
    ...policy.workspaces.map((workspace) => workspace.path + "/package.json"),
  ].sort();
  compareObjects(manifests, expectedManifests, "package manifest set");

  for (const workspace of policy.workspaces) {
    const manifest = readJson(workspace.path + "/package.json");
    const library = workspace.name !== "@agent/cli";
    const expectedKeys = (library
      ? [
          "description",
          "engines",
          "exports",
          "main",
          "name",
          "private",
          "type",
          "types",
          "version",
        ]
      : [
          "description",
          "engines",
          "main",
          "name",
          "private",
          "type",
          "version",
        ]).concat(
      Object.keys(workspace.dependencies).length > 0 ? ["dependencies"] : [],
    );
    compareObjects(
      Object.keys(manifest).sort(),
      expectedKeys.sort(),
      workspace.name + " manifest keys",
    );
    if (
      manifest.name !== workspace.name ||
      manifest.version !== "0.1.0" ||
      manifest.private !== true ||
      manifest.type !== "module"
    ) {
      fail("workspace identity mismatch: " + workspace.path);
    }
    compareObjects(
      manifest.engines,
      { node: ">=22.19.0" },
      workspace.name + " engines",
    );
    if (library) {
      if (manifest.main !== "./dist/index.js" || manifest.types !== "./dist/index.d.ts") {
        fail("library entrypoint mismatch: " + workspace.name);
      }
      compareObjects(
        manifest.exports,
        {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
        workspace.name + " exports",
      );
    } else if (manifest.main !== "./dist/main.js") {
      fail("CLI entrypoint mismatch");
    }
    for (const field of dependencyFields) {
      if (manifest[field] !== undefined) {
        fail(workspace.name + " contains forbidden field " + field);
      }
    }
    compareObjects(
      manifest.dependencies ?? {},
      workspace.dependencies,
      workspace.name + " dependencies",
    );
  }
}

function verifyLockfile() {
  const lockfile = readJson("package-lock.json");
  compareObjects(
    Object.keys(lockfile).sort(),
    ["lockfileVersion", "name", "packages", "requires", "version"],
    "lockfile root keys",
  );
  if (lockfile.lockfileVersion !== 3) {
    fail("package-lock.json must use lockfile version 3");
  }
  if (
    lockfile.name !== "agent-workspace" ||
    lockfile.version !== "0.1.0" ||
    lockfile.requires !== true
  ) {
    fail("lockfile root identity mismatch");
  }
  const expectedKeys = [
    "",
    ...policy.workspaces.map((workspace) => workspace.path),
    ...policy.workspaces.map((workspace) => "node_modules/" + workspace.name),
  ].sort();
  compareObjects(Object.keys(lockfile.packages).sort(), expectedKeys, "lockfile package set");
  const serialized = JSON.stringify(lockfile);
  if (/"(?:integrity|hasInstallScript)"/u.test(serialized) || /https?:|git\+|github:/u.test(serialized)) {
    fail("lockfile contains a foreign source or install script");
  }
  compareObjects(
    lockfile.packages[""],
    {
      name: "agent-workspace",
      version: "0.1.0",
      workspaces: policy.workspaces.map((workspace) => workspace.path),
      bin: { agent: "packages/agent-cli/dist/main.js" },
      engines: { node: ">=22.19.0", npm: "11.16.0" },
    },
    "lockfile root package",
  );
  for (const workspace of policy.workspaces) {
    const link = lockfile.packages["node_modules/" + workspace.name];
    compareObjects(
      link,
      { resolved: workspace.path, link: true },
      "local workspace link " + workspace.name,
    );
    const lockedWorkspace = lockfile.packages[workspace.path];
    const expectedWorkspace = {
      name: workspace.name,
      version: "0.1.0",
    };
    if (Object.keys(workspace.dependencies).length > 0) {
      expectedWorkspace.dependencies = workspace.dependencies;
    }
    compareObjects(
      lockedWorkspace,
      {
        ...expectedWorkspace,
        engines: { node: ">=22.19.0" },
      },
      workspace.name + " locked package",
    );
  }
}

function verifyRepositoryLayout() {
  const rootFiles = new Set([
    ".gitattributes",
    ".gitignore",
    ".npmrc",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "PRIVACY.md",
    "README.md",
    "SECURITY.md",
    "package-lock.json",
    "package.json",
    "tsconfig.base.json",
    "tsconfig.json",
    "tsconfig.tests.json",
  ]);
  const workspaceRoots = policy.workspaces.map((workspace) => workspace.path + "/");

  for (const file of listFiles(".")) {
    if (rootFiles.has(file)) {
      continue;
    }
    if (file === ciPolicy.workflowPath) {
      continue;
    }
    if (evaluationOwnedPaths.has(file)) {
      continue;
    }
    if (/^docs\/(?:decisions\/)?[A-Za-z0-9-]+\.md$/u.test(file)) {
      continue;
    }
    if (/^docs\/manual\/(?:README|[0-9]{2}-[a-z0-9-]+)\.md$/u.test(file)) {
      continue;
    }
    if (
      /^assets\/brand\/(?:README\.md|manifest\.json|agent-auth-logo\.svg|agent-auth-logo-(?:256|512|1024)\.png|agent-wordmark-(?:dark|transparent)\.(?:png|svg))$/u.test(file)
    ) {
      continue;
    }
    if (
      /^tools\/[a-z0-9-]+\.(?:json|mjs|ps1|sh)$/u.test(file) ||
      /^tools\/lib\/[a-z0-9-]+\.mjs$/u.test(file) ||
      /^tools\/test\/[a-z0-9-]+\.test\.mjs$/u.test(file)
    ) {
      continue;
    }
    if (/^types\/(?:node-runtime|node-test)\/index\.d\.ts$/u.test(file)) {
      continue;
    }

    const workspaceRoot = workspaceRoots.find((candidate) => file.startsWith(candidate));
    if (workspaceRoot !== undefined) {
      const relativeFile = file.slice(workspaceRoot.length);
      if (
        ["package.json", "tsconfig.json", "tsconfig.test.json"].includes(relativeFile) ||
        /^src\/[a-z0-9-]+\.ts$/u.test(relativeFile) ||
        /^test\/[a-z0-9-]+\.test\.ts$/u.test(relativeFile) ||
        (
          workspaceRoot === "packages/agent-cli/" &&
          /^native\/(?:clipboard|mutation-commit|process-broker|workspace-roots)\/[a-z0-9-]+\.(?:c|h)$/u.test(relativeFile)
        )
      ) {
        continue;
      }
    }

    fail("unclassified repository artifact is forbidden: " + file);
  }

  const expectedGenerated = [];
  for (const workspace of policy.workspaces) {
    for (const source of listFiles(workspace.path + "/src")) {
      const stem = path.basename(source, ".ts");
      for (const suffix of [".d.ts", ".d.ts.map", ".js", ".js.map"]) {
        expectedGenerated.push(workspace.path + "/dist/" + stem + suffix);
      }
    }
    expectedGenerated.push(workspace.path + "/dist/.tsbuildinfo");

    for (const testFile of listFiles(workspace.path + "/test")) {
      const stem = path.basename(testFile, ".ts");
      for (const suffix of [".d.ts", ".d.ts.map", ".js", ".js.map"]) {
        expectedGenerated.push(workspace.path + "/.test-dist/" + stem + suffix);
      }
    }
    expectedGenerated.push(workspace.path + "/.test-dist/.tsbuildinfo");
  }

  const actualGenerated = listFiles(".", true).filter((file) =>
    /(?:^|\/)(?:dist|\.test-dist)\//u.test(file),
  );
  if (actualGenerated.length > 0 || requireGenerated) {
    compareObjects(
      actualGenerated.sort(),
      expectedGenerated.sort(),
      "generated artifact set",
    );
  }

  const nativeSuffix = process.platform === "win32" ? ".exe" : "";
  const nativeRoot = "packages/agent-cli/.native-build/" + process.platform + "-x64/";
  const actualNativeGenerated = listFiles(".", true)
    .filter((file) => file.startsWith("packages/agent-cli/.native-build/"))
    .sort();
  if (actualNativeGenerated.length > 0 || requireGenerated) {
    const expectedNativeGenerated = [
      nativeRoot + "agent-clipboard-fixture" + nativeSuffix,
      nativeRoot + "agent-mutation-commit" + nativeSuffix,
      nativeRoot + "agent-process-broker" + nativeSuffix,
      nativeRoot + "agent-process-fixture" + nativeSuffix,
      nativeRoot + "agent-workspace-roots" + nativeSuffix,
    ];
    if (process.platform === "win32") {
      expectedNativeGenerated.push(nativeRoot + "agent-clipboard.exe");
    }
    compareObjects(
      actualNativeGenerated,
      expectedNativeGenerated.sort(),
      "native generated artifact set",
    );
  }
}

function verifyDeclarations() {
  const declarations = [
    [
      "types/node-runtime/index.d.ts",
      [
        "node:child_process",
        "node:crypto",
        "node:fs/promises",
        "node:https",
        "node:os",
        "node:path",
        "node:process",
        "node:timers",
        "node:url",
      ],
    ],
    ["types/node-test/index.d.ts", ["node:assert/strict", "node:test"]],
  ];
  for (const [file, expectedModules] of declarations) {
    const modules = [
      ...readText(file).matchAll(/declare module \x22([^\x22]+)\x22/gu),
    ]
      .map((match) => match[1])
      .sort();
    compareObjects(modules, expectedModules.sort(), file + " declared modules");
  }
}

function verifyTypeScriptPolicy() {
  const base = readJson("tsconfig.base.json").compilerOptions;
  const required = {
    target: "ES2022",
    module: "Node16",
    moduleResolution: "Node16",
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noUncheckedSideEffectImports: true,
    useUnknownInCatchVariables: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: false,
    verbatimModuleSyntax: true,
    isolatedModules: true,
    moduleDetection: "force",
    useDefineForClassFields: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    inlineSources: true,
    noEmitOnError: true,
    newLine: "lf",
  };
  for (const [option, expected] of Object.entries(required)) {
    if (base[option] !== expected) {
      fail("TypeScript policy mismatch for compilerOptions." + option);
    }
  }
  compareObjects(
    Object.keys(base).sort(),
    [
      ...Object.keys(required),
      "baseUrl",
      "lib",
      "paths",
      "typeRoots",
      "types",
    ].sort(),
    "TypeScript base option keys",
  );
  if (base.baseUrl !== ".") {
    fail("TypeScript baseUrl policy mismatch");
  }
  compareObjects(base.lib, ["ES2022"], "TypeScript lib policy");
  compareObjects(base.typeRoots, ["types"], "TypeScript typeRoots policy");
  compareObjects(base.types, [], "TypeScript ambient types policy");
  compareObjects(
    base.paths,
    {
      "@agent/core": ["packages/agent-core/src/index.ts"],
      "@agent/tools": ["packages/agent-tools/src/index.ts"],
      "@agent/runtime": ["packages/agent-runtime/src/index.ts"],
      "@agent/provider-opencode-go": [
        "packages/agent-provider-opencode-go/src/index.ts",
      ],
      "@agent/tui": ["packages/agent-tui/src/index.ts"],
    },
    "TypeScript workspace paths",
  );

  compareObjects(
    readJson("tsconfig.json"),
    {
      files: [],
      references: policy.workspaces.map((workspace) => ({ path: workspace.path })),
    },
    "root TypeScript build graph",
  );
  compareObjects(
    readJson("tsconfig.tests.json"),
    {
      files: [],
      references: policy.workspaces.map((workspace) => ({
        path: workspace.path + "/tsconfig.test.json",
      })),
    },
    "root TypeScript test graph",
  );

  for (const workspace of policy.workspaces) {
    const dependencyPaths = Object.keys(workspace.dependencies).map(
      (dependency) => workspaceByName.get(dependency)?.path ?? fail(
        "unknown workspace dependency: " + dependency,
      ),
    );
    const runtimeTypes = workspace.name === "@agent/cli" ? ["node-runtime"] : [];
    const compilerOptions = {
      composite: true,
      rootDir: "src",
      outDir: "dist",
      tsBuildInfoFile: "dist/.tsbuildinfo",
    };
    if (runtimeTypes.length > 0) {
      compilerOptions.types = runtimeTypes;
    }
    const buildConfig = {
      extends: "../../tsconfig.base.json",
      compilerOptions,
      include: ["src/**/*.ts"],
    };
    if (dependencyPaths.length > 0) {
      buildConfig.references = dependencyPaths.map((dependencyPath) => ({
        path: "../" + path.basename(dependencyPath),
      }));
    }
    compareObjects(
      readJson(workspace.path + "/tsconfig.json"),
      buildConfig,
      workspace.name + " TypeScript build config",
    );

    compareObjects(
      readJson(workspace.path + "/tsconfig.test.json"),
      {
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          composite: true,
          rootDir: "test",
          outDir: ".test-dist",
          tsBuildInfoFile: ".test-dist/.tsbuildinfo",
          types: [...runtimeTypes, "node-test"],
        },
        include: ["test/**/*.ts"],
        references: [
          { path: "./tsconfig.json" },
          ...dependencyPaths.map((dependencyPath) => ({
            path: "../" + path.basename(dependencyPath),
          })),
        ],
      },
      workspace.name + " TypeScript test config",
    );
  }
}

function verifyNpmPolicy() {
  const expected =
    "audit=false\n" +
    "engine-strict=true\n" +
    "fund=false\n" +
    "ignore-scripts=true\n" +
    "offline=true\n" +
    "package-lock=true\n" +
    "save-exact=true\n" +
    "update-notifier=false\n";
  if (readText(".npmrc") !== expected) {
    fail(".npmrc does not match the canonical offline policy");
  }
}

function verifyLegacyAbsence() {
  const forbidden = [".cargo", "Cargo.lock", "Cargo.toml", "crates", "target"];
  for (const relativePath of forbidden) {
    if (lstatSync(absolute(relativePath), { throwIfNoEntry: false }) !== undefined) {
      fail("legacy Rust artifact is forbidden after cutover: " + relativePath);
    }
  }
}

function verifySourceHygiene() {
  const ownedFiles = listFiles(".").filter((file) =>
    /\.(?:c|d\.ts|h|json|md|mjs|ps1|sh|ts)$/u.test(file),
  );
  for (const file of ownedFiles) {
    const text = readText(file);
    if (text.startsWith("\uFEFF")) {
      fail("UTF-8 BOM is forbidden: " + file);
    }
    if (text.includes("\r")) {
      fail("CRLF is forbidden: " + file);
    }
    if (text.includes("\t")) {
      fail("tabs are forbidden: " + file);
    }
    if (!text.endsWith("\n")) {
      fail("final newline is required: " + file);
    }
    if (/[ \t]+$/mu.test(text)) {
      fail("trailing whitespace is forbidden: " + file);
    }
    if (/\.(?:json)$/u.test(file)) {
      const canonical = JSON.stringify(JSON.parse(text), null, 2) + "\n";
      if (text !== canonical) {
        fail("JSON formatting is not canonical: " + file);
      }
    }
    if (/\.(?:mjs|ts)$/u.test(file) && /(?:\.only|\.skip)\s*\(/u.test(text)) {
      fail("focused or skipped test is forbidden: " + file);
    }
    if (/\.ts$/u.test(file) && /@ts-(?:ignore|nocheck)/u.test(text)) {
      fail("TypeScript suppression is forbidden: " + file);
    }
  }
}

function sourceContext(file) {
  const workspace = policy.workspaces.find((candidate) =>
    file.startsWith(candidate.path + "/"),
  );
  if (workspace !== undefined) {
    const isTest = file.includes("/test/") || file.includes("/.test-dist/");
    const isCli = workspace.name === "@agent/cli";
    return {
      boundary: absolute(workspace.path),
      workspace,
      failClosedComputedMembers: !isTest,
      allowedNode: isTest
        ? policy.allowedNodeImports.test
        : isCli
          ? policy.allowedNodeImports.product
          : [],
      allowedPackages: isTest
        ? [workspace.name, ...Object.keys(workspace.dependencies)]
        : Object.keys(workspace.dependencies),
    };
  }
  if (file.startsWith("tools/")) {
    return {
      boundary: absolute("tools"),
      workspace: undefined,
      allowedNode: policy.allowedNodeImports.tools,
      allowedPackages: [],
      failClosedComputedMembers: false,
    };
  }
  if (file.startsWith("types/")) {
    return {
      boundary: absolute("types"),
      workspace: undefined,
      allowedNode: [],
      allowedPackages: [],
      failClosedComputedMembers: false,
    };
  }
  return undefined;
}

function verifyImport(file, specifier, line, context) {
  if (specifier.startsWith("node:")) {
    if (!isBuiltin(specifier) || !context.allowedNode.includes(specifier)) {
      fail(file + ":" + String(line) + " disallowed Node import " + specifier);
    }
    return;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!/\.(?:js|mjs)$/u.test(specifier)) {
      fail(file + ":" + String(line) + " relative import needs a runtime extension");
    }
    const resolved = path.resolve(path.dirname(absolute(file)), specifier);
    if (resolved !== context.boundary && !resolved.startsWith(context.boundary + path.sep)) {
      fail(file + ":" + String(line) + " relative import escaped its boundary");
    }
    return;
  }

  if (workspaceByName.has(specifier)) {
    if (!context.allowedPackages.includes(specifier)) {
      fail(file + ":" + String(line) + " undeclared workspace import " + specifier);
    }
    return;
  }

  fail(file + ":" + String(line) + " external module import is forbidden: " + specifier);
}

function verifyImports() {
  const moduleFiles = listFiles(".", true).filter((file) =>
    /\.(?:d\.ts|js|mjs|ts)$/u.test(file),
  );
  for (const file of moduleFiles) {
    const context = sourceContext(file);
    if (context === undefined) {
      continue;
    }
    const analysis = analyzeModule(readText(file), {
      failClosedComputedMembers: context.failClosedComputedMembers,
    });
    for (const forbidden of analysis.forbidden) {
      fail(file + ":" + String(forbidden.line) + " forbidden construct " + forbidden.name);
    }
    for (const entry of analysis.imports) {
      verifyImport(file, entry.specifier, entry.line, context);
    }
  }
}

function verifyNodeModules() {
  const modulesRoot = absolute("node_modules");
  const rootState = lstatSync(modulesRoot, { throwIfNoEntry: false });
  if (rootState === undefined) {
    return;
  }
  const scopeEntries = readdirSync(modulesRoot).sort();
  compareObjects(scopeEntries, [".package-lock.json", "@agent"], "node_modules root");
  const scopeRoot = path.join(modulesRoot, "@agent");
  const packageEntries = readdirSync(scopeRoot).sort();
  compareObjects(
    packageEntries,
    policy.workspaces.map((workspace) => workspace.name.split("/")[1]).sort(),
    "node_modules workspace links",
  );
  for (const workspace of policy.workspaces) {
    const shortName = workspace.name.split("/")[1];
    const linkPath = path.join(scopeRoot, shortName);
    const state = lstatSync(linkPath);
    if (!state.isSymbolicLink()) {
      fail("workspace install is not a link: " + workspace.name);
    }
    if (realpathSync(linkPath) !== realpathSync(absolute(workspace.path))) {
      fail("workspace link target mismatch: " + workspace.name);
    }
  }
}

verifyToolchain();
verifyDocuments();
verifyCiPolicy();
verifyBrandPolicy();
verifyEvaluationPolicy();
verifyManual();
verifyProviderPolicy();
verifyPublicationPolicy();
verifyManifests();
verifyLockfile();
verifyNpmPolicy();
verifyLegacyAbsence();
verifyRepositoryLayout();
verifyDeclarations();
verifyTypeScriptPolicy();
verifySourceHygiene();
verifyImports();
verifyNodeModules();

process.stdout.write(
  "Ownership verification passed: toolchain, CI, brand, evaluation, manual, publication, manifests, lockfile, source, imports, and workspace links.\n",
);
