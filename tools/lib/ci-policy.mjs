const EXPECTED_POLICY = Object.freeze({
  schemaVersion: 2,
  workflowPath: ".github/workflows/verify.yml",
  workflowName: "verify",
  jobs: Object.freeze([
    Object.freeze({
      id: "verify-windows",
      runner: "windows-2025",
      timeoutMinutes: 25,
      containmentBootstrap: false,
    }),
    Object.freeze({
      id: "verify-linux",
      runner: "ubuntu-24.04",
      timeoutMinutes: 25,
      containmentBootstrap: true,
    }),
  ]),
  protectedBranches: Object.freeze(["main"]),
  canonicalCommand:
    "powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1",
});

export class CiPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "CiPolicyError";
  }
}

function fail(message) {
  throw new CiPolicyError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(label + " keys mismatch");
  }
}

function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + " mismatch");
  }
}

function workflowHeader(policy) {
  const branch = policy.protectedBranches.at(0);
  return [
    "name: " + policy.workflowName,
    "",
    "on:",
    "  pull_request:",
    "    branches:",
    "      - " + branch,
    "  push:",
    "    branches:",
    "      - " + branch,
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "concurrency:",
    "  group: verify-${{ github.workflow }}-${{ github.ref }}",
    "  cancel-in-progress: true",
    "",
    "jobs:",
  ];
}

function windowsJob(policy, toolchain) {
  const job = policy.jobs.at(0);
  return [
    "  " + job.id + ":",
    "    name: " + job.id,
    "    runs-on: " + job.runner,
    "    timeout-minutes: " + String(job.timeoutMinutes),
    "    steps:",
    "      - name: Check out exact revision",
    "        shell: powershell",
    "        env:",
    "          AGENT_REPOSITORY: ${{ github.repository }}",
    "          AGENT_REVISION: ${{ github.sha }}",
    "          AGENT_REF: ${{ github.ref }}",
    "        run: |",
    "          Set-StrictMode -Version Latest",
    "          $ErrorActionPreference = \"Stop\"",
    "",
    "          function Invoke-Checked {",
    "              param(",
    "                  [Parameter(Mandatory)]",
    "                  [string]$Program,",
    "                  [Parameter(Mandatory)]",
    "                  [string[]]$Arguments",
    "              )",
    "",
    "              & $Program @Arguments",
    "              if ($LASTEXITCODE -ne 0) {",
    "                  throw \"Command failed with exit code ${LASTEXITCODE}: $Program\"",
    "              }",
    "          }",
    "",
    "          if ($env:AGENT_REPOSITORY -notmatch \"\\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\\z\") {",
    "              throw \"Repository identity is malformed.\"",
    "          }",
    "          if ($env:AGENT_REVISION -notmatch \"\\A[0-9a-f]{40}\\z\") {",
    "              throw \"Revision identity is malformed.\"",
    "          }",
    "          if ($env:AGENT_REF -notmatch \"\\Arefs/(?:heads/main|pull/[1-9][0-9]*/merge)\\z\") {",
    "              throw \"Workflow ref is outside the verified branch contract.\"",
    "          }",
    "",
    "          Invoke-Checked -Program \"git\" -Arguments @(\"init\", \".\")",
    "          Invoke-Checked -Program \"git\" -Arguments @(",
    "              \"remote\",",
    "              \"add\",",
    "              \"origin\",",
    "              \"https://github.com/$($env:AGENT_REPOSITORY).git\"",
    "          )",
    "          Invoke-Checked -Program \"git\" -Arguments @(",
    "              \"-c\",",
    "              \"protocol.version=2\",",
    "              \"fetch\",",
    "              \"--no-tags\",",
    "              \"--depth=1\",",
    "              \"origin\",",
    "              $env:AGENT_REF",
    "          )",
    "          Invoke-Checked -Program \"git\" -Arguments @(\"checkout\", \"--detach\", \"FETCH_HEAD\")",
    "          $actualRevision = (& git rev-parse HEAD).Trim()",
    "          if ($LASTEXITCODE -ne 0 -or $actualRevision -ne $env:AGENT_REVISION) {",
    "              throw \"Checked-out revision does not match the event revision.\"",
    "          }",
    "          Invoke-Checked -Program \"git\" -Arguments @(\"remote\", \"remove\", \"origin\")",
    "",
    "      - name: Provision registered verification toolchain",
    "        shell: powershell",
    "        env:",
    "          AGENT_NPM_VERSION: \"" + toolchain.npm.exactVersion + "\"",
    "          AGENT_TYPESCRIPT_VERSION: \"" + toolchain.typescript.exactVersion + "\"",
    "          NPM_CONFIG_OFFLINE: \"false\"",
    "          NPM_CONFIG_UPDATE_NOTIFIER: \"false\"",
    "        run: |",
    "          Set-StrictMode -Version Latest",
    "          $ErrorActionPreference = \"Stop\"",
    "          npm install --global \"npm@$($env:AGENT_NPM_VERSION)\" \"typescript@$($env:AGENT_TYPESCRIPT_VERSION)\" --offline=false --ignore-scripts --no-audit --no-fund",
    "          if ($LASTEXITCODE -ne 0) {",
    "              throw \"Registered verification toolchain provisioning failed.\"",
    "          }",
    "",
    "      - name: Run canonical owned verifier",
    "        shell: powershell",
    "        run: " + policy.canonicalCommand,
  ];
}

function linuxJob(policy, toolchain) {
  const job = policy.jobs.at(1);
  return [
    "",
    "  " + job.id + ":",
    "    name: " + job.id,
    "    runs-on: " + job.runner,
    "    timeout-minutes: " + String(job.timeoutMinutes),
    "    steps:",
    "      - name: Check out exact revision",
    "        shell: bash",
    "        env:",
    "          AGENT_REPOSITORY: ${{ github.repository }}",
    "          AGENT_REVISION: ${{ github.sha }}",
    "          AGENT_REF: ${{ github.ref }}",
    "        run: |",
    "          set -euo pipefail",
    "          if [[ ! \"$AGENT_REPOSITORY\" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then",
    "            printf '%s\\n' 'Repository identity is malformed.' >&2",
    "            exit 1",
    "          fi",
    "          if [[ ! \"$AGENT_REVISION\" =~ ^[0-9a-f]{40}$ ]]; then",
    "            printf '%s\\n' 'Revision identity is malformed.' >&2",
    "            exit 1",
    "          fi",
    "          if [[ ! \"$AGENT_REF\" =~ ^refs/(heads/main|pull/[1-9][0-9]*/merge)$ ]]; then",
    "            printf '%s\\n' 'Workflow ref is outside the verified branch contract.' >&2",
    "            exit 1",
    "          fi",
    "          git init .",
    "          git remote add origin \"https://github.com/${AGENT_REPOSITORY}.git\"",
    "          git -c protocol.version=2 fetch --no-tags --depth=1 origin \"$AGENT_REF\"",
    "          git checkout --detach FETCH_HEAD",
    "          actual_revision=\"$(git rev-parse HEAD)\"",
    "          if [[ \"$actual_revision\" != \"$AGENT_REVISION\" ]]; then",
    "            printf '%s\\n' 'Checked-out revision does not match the event revision.' >&2",
    "            exit 1",
    "          fi",
    "          git remote remove origin",
    "",
    "      - name: Provision registered verification toolchain",
    "        shell: bash",
    "        env:",
    "          AGENT_NPM_VERSION: \"" + toolchain.npm.exactVersion + "\"",
    "          AGENT_TYPESCRIPT_VERSION: \"" + toolchain.typescript.exactVersion + "\"",
    "          NPM_CONFIG_OFFLINE: \"false\"",
    "          NPM_CONFIG_UPDATE_NOTIFIER: \"false\"",
    "        run: |",
    "          set -euo pipefail",
    "          npm install --global \"npm@${AGENT_NPM_VERSION}\" \"typescript@${AGENT_TYPESCRIPT_VERSION}\" --offline=false --ignore-scripts --no-audit --no-fund",
    "",
    "      - name: Run canonical verifier in delegated containment",
    "        shell: bash",
    "        run: |",
    "          set -euo pipefail",
    "          trap 'bash tools/prepare-linux-containment.sh cleanup \"$$\"' EXIT",
    "          bash tools/prepare-linux-containment.sh setup \"$$\"",
    "          " + policy.canonicalCommand,
  ];
}

function canonicalWorkflow(policy, toolchain) {
  return [
    ...workflowHeader(policy),
    ...windowsJob(policy, toolchain),
    ...linuxJob(policy, toolchain),
  ].join("\n") + "\n";
}

function validateToolchain(toolchain) {
  exactKeys(
    toolchain,
    ["schemaVersion", "node", "npm", "typescript", "nativeC"],
    "toolchain",
  );
  exactKeys(toolchain.node, ["minimumVersion"], "Node toolchain");
  exactKeys(toolchain.npm, ["exactVersion"], "npm toolchain");
  exactKeys(toolchain.typescript, ["exactVersion"], "TypeScript toolchain");
  exactKeys(
    toolchain.nativeC,
    [
      "languageStandard",
      "compiler",
      "minimumMajorVersion",
      "platforms",
      "architectures",
    ],
    "native C toolchain",
  );
  if (
    toolchain.schemaVersion !== 2 ||
    typeof toolchain.node.minimumVersion !== "string" ||
    typeof toolchain.npm.exactVersion !== "string" ||
    typeof toolchain.typescript.exactVersion !== "string" ||
    toolchain.nativeC.languageStandard !== "c17" ||
    toolchain.nativeC.compiler !== "clang" ||
    !Number.isSafeInteger(toolchain.nativeC.minimumMajorVersion) ||
    JSON.stringify(toolchain.nativeC.platforms) !== JSON.stringify(["linux", "win32"]) ||
    JSON.stringify(toolchain.nativeC.architectures) !== JSON.stringify(["x64"])
  ) {
    fail("toolchain contract is malformed");
  }
}

/** Validates the exact owned cross-platform verification workflow offline. */
export function validateCiPolicy(policy, context) {
  exactKeys(policy, Object.keys(EXPECTED_POLICY), "CI policy");
  if (!isRecord(context)) {
    fail("CI context must be an object");
  }
  exactKeys(context, ["workflowText", "toolchain"], "CI context");
  same(policy, EXPECTED_POLICY, "CI policy");
  if (typeof context.workflowText !== "string") {
    fail("CI workflow must be text");
  }
  validateToolchain(context.toolchain);
  if (/^\s*-\s*uses\s*:/mu.test(context.workflowText)) {
    fail("CI workflow imports an external action");
  }
  if (/\$\{\{\s*secrets\./u.test(context.workflowText)) {
    fail("CI workflow may not consume repository secrets");
  }
  if (context.workflowText.includes("pull_request_target:")) {
    fail("CI workflow may not run pull-request code with target privileges");
  }
  if (context.workflowText !== canonicalWorkflow(policy, context.toolchain)) {
    fail("CI workflow drifted from the canonical owned contract");
  }
}
