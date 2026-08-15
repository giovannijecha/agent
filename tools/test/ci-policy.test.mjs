import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { CiPolicyError, validateCiPolicy } from "../lib/ci-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

const policy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/ci-policy.json"), "utf8"),
);
const toolchain = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/toolchain.json"), "utf8"),
);

function currentContext() {
  return {
    workflowText: readFileSync(path.join(projectRoot, policy.workflowPath), "utf8"),
    toolchain: structuredClone(toolchain),
  };
}

test("accepts the canonical owned continuous-verification workflow", () => {
  assert.doesNotThrow(() => validateCiPolicy(policy, currentContext()));
});

test("fetches the immutable event revision instead of the mutable workflow ref", () => {
  assert.equal(policy.checkoutTarget, "event-revision");
  const workflow = currentContext().workflowText;
  assert.match(workflow, /"origin",\n\s+\$env:AGENT_REVISION\n/u);
  assert.match(
    workflow,
    /git -c protocol\.version=2 fetch --no-tags --depth=1 origin "\$AGENT_REVISION"/u,
  );
  assert.doesNotMatch(workflow, /"origin",\n\s+\$env:AGENT_REF\n/u);
  assert.doesNotMatch(
    workflow,
    /git -c protocol\.version=2 fetch --no-tags --depth=1 origin "\$AGENT_REF"/u,
  );
});

test("rejects mutable checkout authority in the CI registry", () => {
  const changed = structuredClone(policy);
  changed.checkoutTarget = "workflow-ref";
  assert.throws(
    () => validateCiPolicy(changed, currentContext()),
    CiPolicyError,
  );
});

test("rejects imported actions and secret consumption", () => {
  const imported = currentContext();
  imported.workflowText = imported.workflowText.replace(
    "      - name: Check out exact revision",
    "      - uses: actions/checkout@v4\n      - name: Check out exact revision",
  );
  assert.throws(
    () => validateCiPolicy(policy, imported),
    /imports an external action/u,
  );

  const secret = currentContext();
  secret.workflowText = secret.workflowText.replace(
    "          AGENT_REF: ${{ github.ref }}",
    "          AGENT_REF: ${{ secrets.PRIVATE_REF }}",
  );
  assert.throws(() => validateCiPolicy(policy, secret), /repository secrets/u);
});

test("rejects privileged pull-request execution and workflow drift", () => {
  const privileged = currentContext();
  privileged.workflowText = privileged.workflowText.replace(
    "  pull_request:",
    "  pull_request_target:",
  );
  assert.throws(
    () => validateCiPolicy(policy, privileged),
    /target privileges/u,
  );

  const drifted = currentContext();
  drifted.workflowText = drifted.workflowText.replace(
    "timeout-minutes: 25",
    "timeout-minutes: 60",
  );
  assert.throws(() => validateCiPolicy(policy, drifted), /workflow drifted/u);
});

test("rejects platform-matrix and registered-toolchain drift", () => {
  const changedPolicy = structuredClone(policy);
  changedPolicy.jobs[1].runner = "ubuntu-latest";
  assert.throws(
    () => validateCiPolicy(changedPolicy, currentContext()),
    CiPolicyError,
  );

  const changedToolchain = currentContext();
  changedToolchain.toolchain.typescript.exactVersion = "0.0.0";
  assert.throws(
    () => validateCiPolicy(policy, changedToolchain),
    /workflow drifted/u,
  );

  const changedNativeToolchain = currentContext();
  changedNativeToolchain.toolchain.nativeC.compiler = "cc";
  assert.throws(
    () => validateCiPolicy(policy, changedNativeToolchain),
    /toolchain contract is malformed/u,
  );
});

test("rejects removal of the Linux containment bootstrap", () => {
  const changed = currentContext();
  changed.workflowText = changed.workflowText.replace(
    "          bash tools/prepare-linux-containment.sh setup \"$$\"\n",
    "",
  );
  assert.throws(
    () => validateCiPolicy(policy, changed),
    /workflow drifted/u,
  );
});
