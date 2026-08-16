import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PublicationPolicyError,
  validatePublicationPolicy,
} from "../lib/publication-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

const policy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/publication-policy.json"), "utf8"),
);

function currentContext() {
  return {
    files: Object.fromEntries(
      policy.documents.map((file) => [
        file,
        readFileSync(path.join(projectRoot, file), "utf8"),
      ]),
    ),
  };
}

test("accepts the canonical public project identity", () => {
  assert.doesNotThrow(() => validatePublicationPolicy(policy, currentContext()));
});

test("rejects public identity drift", () => {
  const changed = structuredClone(policy);
  changed.project.maintainer = "Different Maintainer";
  assert.throws(
    () => validatePublicationPolicy(changed, currentContext()),
    PublicationPolicyError,
  );
});

test("rejects single-agent execution posture drift", () => {
  const changed = structuredClone(policy);
  changed.posture.executionModel = "multi-agent";
  assert.throws(
    () => validatePublicationPolicy(changed, currentContext()),
    PublicationPolicyError,
  );

  const concurrentMutation = structuredClone(policy);
  concurrentMutation.posture.mechanicalConcurrency = "unrestricted";
  assert.throws(
    () => validatePublicationPolicy(concurrentMutation, currentContext()),
    PublicationPolicyError,
  );
});

test("rejects single-agent public contract drift", () => {
  const cases = [
    ["README.md", "Future controller-internal mechanical concurrency"],
    ["AGENTS.md", "Current runtime remains sequential"],
    ["docs/ARCHITECTURE.md", "Any mutation excludes concurrent mechanics"],
    ["docs/ENGINEERING.md", "Current runtime remains sequential"],
    [
      "docs/manual/07-publishing-and-governance.md",
      "Current runtime remains sequential",
    ],
    [
      "docs/decisions/0013-single-agent-execution.md",
      "Mechanical concurrency does not create another agent",
    ],
  ];

  for (const [file, marker] of cases) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(
      marker,
      "Concurrent workers may act as separate agents",
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      file,
    );
  }
});

test("rejects deterministic motion public contract drift", () => {
  const context = currentContext();
  context.files["docs/decisions/0038-owned-deterministic-tui-motion.md"] =
    context.files[
      "docs/decisions/0038-owned-deterministic-tui-motion.md"
    ].replace(
      "The first visible projection is one constant-width three-cell pulse",
      "The visible projection may change width between frames",
    );

  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects rail-free public terminal contract drift", () => {
  const cases = [
    ["rail-free transparent", "muted exact-height left rail"],
    ["removed rows in restrained red", "removed rows without color"],
    ["foreground for the selected row", "weight for the selected row"],
  ];

  for (const [marker, replacement] of cases) {
    const context = currentContext();
    context.files["README.md"] = context.files["README.md"].replace(
      marker,
      replacement,
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects modified license terms", () => {
  const context = currentContext();
  context.files.LICENSE = context.files.LICENSE.replace(
    "Grant of Patent License",
    "Patent Terms",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects a Git checkout policy that can alter verified text", () => {
  const context = currentContext();
  context.files[".gitattributes"] = "* text=auto\n";
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects missing public links and automated attribution", () => {
  const missingLink = currentContext();
  missingLink.files["README.md"] = missingLink.files["README.md"].replace(
    "(PRIVACY.md)",
    "(missing.md)",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, missingLink),
    PublicationPolicyError,
  );

  const missingRequestLink = currentContext();
  missingRequestLink.files["README.md"] = missingRequestLink.files["README.md"].replaceAll(
    "(docs/PROVIDER-APPLICATIONS.md)",
    "(missing-requests.md)",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, missingRequestLink),
    PublicationPolicyError,
  );

  const missingSubmissionReference = currentContext();
  missingSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"].replace(
      "community.openai.com/t/independent-native-oauth-public-client-registration-request-for-agent/1389585",
      "example.com/unverified-submission",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingSubmissionReference),
    PublicationPolicyError,
  );

  const missingPrivateSubmissionReference = currentContext();
  missingPrivateSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingPrivateSubmissionReference.files[
      "docs/PROVIDER-APPLICATIONS.md"
    ].replace(
      "anthropic-support-messenger-2026-08-08",
      "conversation-unverified",
    );
  assert.throws(
    () =>
      validatePublicationPolicy(policy, missingPrivateSubmissionReference),
    PublicationPolicyError,
  );

  const missingKimiSubmissionReference = currentContext();
  missingKimiSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingKimiSubmissionReference.files[
      "docs/PROVIDER-APPLICATIONS.md"
    ].replace(
      "kimi-support-email-2026-08-08",
      "kimi-support-email-unverified",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingKimiSubmissionReference),
    PublicationPolicyError,
  );

  const missingXaiSubmissionReference = currentContext();
  missingXaiSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingXaiSubmissionReference.files[
      "docs/PROVIDER-APPLICATIONS.md"
    ].replace(
      "xai-support-email-2026-08-08",
      "xai-support-email-unverified",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingXaiSubmissionReference),
    PublicationPolicyError,
  );

  const attributed = currentContext();
  attributed.files["README.md"] += "\nGenerated by Codex.\n";
  assert.throws(
    () => validatePublicationPolicy(policy, attributed),
    PublicationPolicyError,
  );
});

test("rejects unverifiable no-tool authorship claims", () => {
  const context = currentContext();
  context.files["CONTRIBUTING.md"] += "\nThis is 100% human-written.\n";
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});
