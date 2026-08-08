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
    "timeout-minutes: 20",
    "timeout-minutes: 60",
  );
  assert.throws(() => validateCiPolicy(policy, drifted), /workflow drifted/u);
});

test("rejects registry and pinned-toolchain drift", () => {
  const changedPolicy = structuredClone(policy);
  changedPolicy.runner = "ubuntu-latest";
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
});
