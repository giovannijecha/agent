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
    "@agent/provider-opencode-go",
    "@agent/tui",
    "@agent/cli",
  ],
  productSources: [],
  applicationText: currentApplications,
};

test("accepts the canonical blocked and direct provider registry", () => {
  assert.doesNotThrow(() => validateProviderPolicy(currentPolicy, emptyContext));
  assert.deepEqual(
    currentPolicy.providers.map((provider) => provider.id),
    ["chatgpt", "claude", "kimi", "grok"],
  );
  assert.deepEqual(
    currentPolicy.directProviders.map((provider) => provider.id),
    ["opencode-go"],
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

test("rejects drift in the single admitted direct provider", () => {
  for (const [field, value] of [
    ["endpoint", "https://example.com/v1"],
    ["model", "unreviewed-model"],
    ["credentialVariable", "UNREVIEWED_KEY"],
    ["credentialPersistence", "disk"],
  ]) {
    const drifted = structuredClone(currentPolicy);
    drifted.directProviders[0][field] = value;
    assert.throws(
      () => validateProviderPolicy(drifted, emptyContext),
      ProviderPolicyError,
    );
  }

  const extra = structuredClone(currentPolicy);
  extra.directProviders.push(structuredClone(extra.directProviders[0]));
  assert.throws(
    () => validateProviderPolicy(extra, emptyContext),
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

test("rejects response-record drift and private response disclosure", () => {
  const invalidState = structuredClone(currentPolicy);
  invalidState.providers[2].request.response.state = "approved";
  assert.throws(
    () => validateProviderPolicy(invalidState, emptyContext),
    ProviderPolicyError,
  );

  const invalidDate = structuredClone(currentPolicy);
  invalidDate.providers[2].request.response.receivedOn = "11-08-2026";
  assert.throws(
    () => validateProviderPolicy(invalidDate, emptyContext),
    ProviderPolicyError,
  );

  const unsupportedOutcome = structuredClone(currentPolicy);
  unsupportedOutcome.providers[2].request.response.outcome = "approved";
  assert.throws(
    () => validateProviderPolicy(unsupportedOutcome, emptyContext),
    ProviderPolicyError,
  );

  const privateIdentifier = structuredClone(currentPolicy);
  privateIdentifier.providers[2].request.response.reference =
    "private-account@example.com";
  assert.throws(
    () => validateProviderPolicy(privateIdentifier, emptyContext),
    ProviderPolicyError,
  );

  const missingResponseReference = currentApplications.replace(
    "kimi-support-response-2026-08-11",
    "kimi-support-response-unverified",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: missingResponseReference,
      }),
    ProviderPolicyError,
  );

  const falseResponse = currentApplications.replace(
    "- Response state: `received`",
    "- Response state: `approved`",
  );
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        applicationText: falseResponse,
      }),
    ProviderPolicyError,
  );
});

test("rejects every provider or auth workspace that was not admitted", () => {
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

test("allows only the reviewed direct-provider literals in their exact files", () => {
  const admitted = [
    {
      path: "packages/agent-provider-opencode-go/src/wire.ts",
      text: "export const model = 'kimi-k2.7-code';\n",
    },
    {
      path: "packages/agent-cli/src/node-opencode-go-transport.ts",
      text: "const authorization = 'Bearer ' + credential;\n",
    },
  ];
  assert.doesNotThrow(() =>
    validateProviderPolicy(currentPolicy, {
      ...emptyContext,
      productSources: admitted,
    }),
  );

  for (const source of admitted) {
    assert.throws(
      () =>
        validateProviderPolicy(currentPolicy, {
          ...emptyContext,
          productSources: [
            { path: "packages/example/src/provider.ts", text: source.text },
          ],
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
