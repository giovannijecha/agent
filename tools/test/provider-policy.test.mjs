import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ProviderPolicyError,
  validateProviderPolicy,
} from "../lib/provider-policy.mjs";

const currentPolicy = JSON.parse(
  readFileSync(new URL("../provider-policy.json", import.meta.url), "utf8"),
);
const currentApplications = readFileSync(
  new URL("../../docs/PROVIDER-APPLICATIONS.md", import.meta.url),
  "utf8",
);
const emptyContext = {
  workspaceNames: [
    "@agent/core",
    "@agent/tools",
    "@agent/runtime",
    "@agent/tui",
    "@agent/cli",
  ],
  productSources: [],
  applicationText: currentApplications,
};

test("accepts the canonical blocked provider registry", () => {
  assert.doesNotThrow(() => validateProviderPolicy(currentPolicy, emptyContext));
  assert.deepEqual(
    currentPolicy.providers.map((provider) => provider.id),
    ["chatgpt", "claude", "kimi", "grok"],
  );
});

test("rejects duplicate or missing provider registrations", () => {
  const duplicated = structuredClone(currentPolicy);
  duplicated.providers[3] = structuredClone(duplicated.providers[2]);
  assert.throws(
    () => validateProviderPolicy(duplicated, emptyContext),
    ProviderPolicyError,
  );

  const missing = structuredClone(currentPolicy);
  missing.providers.pop();
  assert.throws(
    () => validateProviderPolicy(missing, emptyContext),
    ProviderPolicyError,
  );
});

test("rejects credential and endpoint fields for blocked providers", () => {
  const configured = structuredClone(currentPolicy);
  configured.providers[0].clientId = "foreign-application";
  assert.throws(
    () => validateProviderPolicy(configured, emptyContext),
    ProviderPolicyError,
  );
});

test("rejects incomplete or stale provider registration requests", () => {
  const missingAnswer = currentApplications.replace(
    "### Required written answer",
    "### Missing answer contract",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: missingAnswer,
      }),
    ProviderPolicyError,
  );

  const stalePolicy = structuredClone(currentPolicy);
  stalePolicy.researchedOn = "2026-08-07";
  assert.throws(
    () => validateProviderPolicy(stalePolicy, emptyContext),
    ProviderPolicyError,
  );

  const untrustedEvidence = currentApplications.replace(
    "https://developers.openai.com/codex/auth/",
    "https://example.com/unverified",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: untrustedEvidence,
      }),
    ProviderPolicyError,
  );

  const untrustedRoute = currentApplications.replace(
    "mailto:code@moonshot.ai",
    "mailto:unverified@example.com",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: untrustedRoute,
      }),
    ProviderPolicyError,
  );
});

test("rejects submission-record drift and personal email addresses", () => {
  const reverted = structuredClone(currentPolicy);
  reverted.providers[0].request.state = "ready-not-submitted";
  assert.throws(
    () => validateProviderPolicy(reverted, emptyContext),
    ProviderPolicyError,
  );

  const missingReference = structuredClone(currentPolicy);
  missingReference.providers[0].request.reference = null;
  assert.throws(
    () => validateProviderPolicy(missingReference, emptyContext),
    ProviderPolicyError,
  );

  const invalidDate = structuredClone(currentPolicy);
  invalidDate.providers[0].request.submittedOn = "08-08-2026";
  assert.throws(
    () => validateProviderPolicy(invalidDate, emptyContext),
    ProviderPolicyError,
  );

  const insecurePublicReference = structuredClone(currentPolicy);
  insecurePublicReference.providers[0].request.reference =
    "http://community.openai.com/unverified";
  assert.throws(
    () => validateProviderPolicy(insecurePublicReference, emptyContext),
    ProviderPolicyError,
  );

  const unsubmittedWithMetadata = structuredClone(currentPolicy);
  unsubmittedWithMetadata.providers[3].request.state = "ready-not-submitted";
  assert.throws(
    () => validateProviderPolicy(unsubmittedWithMetadata, emptyContext),
    ProviderPolicyError,
  );

  const invalidPrivateReference = structuredClone(currentPolicy);
  invalidPrivateReference.providers[1].request.reference =
    "https://support.claude.com/private-case";
  assert.throws(
    () => validateProviderPolicy(invalidPrivateReference, emptyContext),
    ProviderPolicyError,
  );

  const missingPrivateDocumentReference = currentApplications.replace(
    "anthropic-support-messenger-2026-08-08",
    "conversation-unverified",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: missingPrivateDocumentReference,
      }),
    ProviderPolicyError,
  );

  const missingKimiDocumentReference = currentApplications.replace(
    "kimi-support-email-2026-08-08",
    "kimi-support-email-unverified",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: missingKimiDocumentReference,
      }),
    ProviderPolicyError,
  );

  const missingXaiDocumentReference = currentApplications.replace(
    "xai-support-email-2026-08-08",
    "xai-support-email-unverified",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: missingXaiDocumentReference,
      }),
    ProviderPolicyError,
  );

  const missingDocumentReference = currentApplications.replace(
    "https://community.openai.com/t/independent-native-oauth-public-client-registration-request-for-agent/1389585",
    "https://example.com/unverified-submission",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: missingDocumentReference,
      }),
    ProviderPolicyError,
  );

  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: currentApplications + "\nprivate@example.com\n",
      }),
    ProviderPolicyError,
  );
});

test("rejects provider or auth workspaces while every provider is blocked", () => {
  for (const workspaceName of [
    "@agent/provider-chatgpt",
    "@agent/auth-client",
    "@agent/oauth",
    "@agent/integrations",
  ]) {
    assert.throws(
      () =>
        validateProviderPolicy(currentPolicy, {
          ...emptyContext,
          workspaceNames: [...emptyContext.workspaceNames, workspaceName],
        }),
      ProviderPolicyError,
    );
  }
});

test("rejects subscription endpoints, OAuth identifiers, and foreign identities", () => {
  const forbidden = [
    "const endpoint = 'https://auth.openai.com/example';\n",
    "const CLIENT_ID = 'foreign-application';\n",
    "const credential = { refreshToken: 'sentinel' };\n",
    "const response = { access_token: 'sentinel' };\n",
    "const provider = 'chatgpt';\n",
    "const foreignIdentity = 'pi';\n",
    "const prompt = 'You are Claude Code';\n",
    "const store = '.kimi-code/session';\n",
    "declare const fetch: (url: string) => Promise<unknown>;\n",
    "const endpoint = 'https://chat\\x67pt.com/' + 'backend-api';\n",
    "const key = 'access' + '_token';\n",
    "const applicationId = 'foreign';\n",
    "const bearerValue = 'sentinel';\n",
    "const identity = 'p' + 'i/0.84.1';\n",
    "const path = '.co' + 'dex/auth.json';\n",
    "const request = { originator: 'p' + 'i' };\n",
  ];

  for (const text of forbidden) {
    assert.throws(
      () =>
        validateProviderPolicy(currentPolicy, {
          ...emptyContext,
          productSources: [{ path: "packages/example/src/provider.ts", text }],
        }),
      ProviderPolicyError,
    );
  }
});

test("rejects broad process imports, ambient network declarations, and test fixtures", () => {
  const sources = [
    {
      path: "packages/example/src/platform.ts",
      text: "import runtime from 'node:process';\n",
    },
    {
      path: "packages/example/src/platform.ts",
      text: "import * as runtime from 'node:process';\n",
    },
    {
      path: "packages/example/src/platform.ts",
      text: "import { default as runtime } from 'node:process';\n",
    },
    {
      path: "packages/example/test/auth.test.ts",
      text: "const protocol = 'oauth';\n",
    },
    {
      path: "types/example/index.d.ts",
      text: "declare function fetch(url: string): Promise<unknown>;\n",
    },
  ];

  for (const source of sources) {
    assert.throws(
      () =>
        validateProviderPolicy(currentPolicy, {
          ...emptyContext,
          productSources: [source],
        }),
      ProviderPolicyError,
    );
  }
});

test("accepts unrelated low-entropy source tokens", () => {
  const legitimate = [
    "const route = 'api/example';\n",
    "const bear_error = 'ordinary';\n",
    "const clear_error = 'ordinary';\n",
    "const applicationIdentifier = 'local';\n",
  ];

  for (const text of legitimate) {
    assert.doesNotThrow(() =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        productSources: [{ path: "packages/example/src/local.ts", text }],
      }),
    );
  }
});
