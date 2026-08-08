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
const emptyContext = {
  workspaceNames: [
    "@agent/core",
    "@agent/tools",
    "@agent/runtime",
    "@agent/tui",
    "@agent/cli",
  ],
  productSources: [],
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
