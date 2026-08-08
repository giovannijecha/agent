const EXPECTED_POLICY = Object.freeze({
  schemaVersion: 1,
  workflowPath: ".github/workflows/verify.yml",
  workflowName: "verify",
  jobName: "verify",
  runner: "windows-latest",
  timeoutMinutes: 20,
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

function canonicalWorkflow(policy, toolchain) {
  const branch = policy.protectedBranches.at(0);
  const npmVersion = toolchain.npm.exactVersion;
  const typescriptVersion = toolchain.typescript.exactVersion;
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
    "  " + policy.jobName + ":",
    "    name: " + policy.jobName,
    "    runs-on: " + policy.runner,
    "    timeout-minutes: " + String(policy.timeoutMinutes),
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
    "      - name: Provision pinned verification toolchain",
    "        shell: powershell",
    "        env:",
    "          AGENT_NPM_VERSION: \"" + npmVersion + "\"",
    "          AGENT_TYPESCRIPT_VERSION: \"" + typescriptVersion + "\"",
    "          NPM_CONFIG_OFFLINE: \"false\"",
    "          NPM_CONFIG_UPDATE_NOTIFIER: \"false\"",
    "        run: |",
    "          Set-StrictMode -Version Latest",
    "          $ErrorActionPreference = \"Stop\"",
    "          npm install --global \"npm@$($env:AGENT_NPM_VERSION)\" \"typescript@$($env:AGENT_TYPESCRIPT_VERSION)\" --offline=false --ignore-scripts --no-audit --no-fund",
    "          if ($LASTEXITCODE -ne 0) {",
    "              throw \"Pinned verification toolchain provisioning failed.\"",
    "          }",
    "",
    "      - name: Run canonical owned verifier",
    "        shell: powershell",
    "        run: " + policy.canonicalCommand,
  ].join("\n") + "\n";
}

function validateToolchain(toolchain) {
  exactKeys(toolchain, ["schemaVersion", "node", "npm", "typescript"], "toolchain");
  exactKeys(toolchain.node, ["minimumVersion"], "Node toolchain");
  exactKeys(toolchain.npm, ["exactVersion"], "npm toolchain");
  exactKeys(toolchain.typescript, ["exactVersion"], "TypeScript toolchain");
  if (
    toolchain.schemaVersion !== 1 ||
    typeof toolchain.node.minimumVersion !== "string" ||
    typeof toolchain.npm.exactVersion !== "string" ||
    typeof toolchain.typescript.exactVersion !== "string"
  ) {
    fail("toolchain contract is malformed");
  }
}

/** Validates the exact owned continuous-verification workflow offline. */
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
