import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ProviderPolicyError,
  validateProviderPolicy,
} from "../lib/provider-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".test-dist"
    ) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolute));
    } else if (entry.isFile()) {
      files.push(path.relative(projectRoot, absolute).split(path.sep).join("/"));
    }
  }
  return files;
}

const currentProductSources = collectFiles(projectRoot)
  .filter((file) =>
    /^packages\/[a-z0-9-]+\/(?:src|test)\/.*\.ts$/u.test(file) ||
    /^types\/.*\.d\.ts$/u.test(file) ||
    /^packages\/agent-cli\/native\/.*\.(?:c|h)$/u.test(file)
  )
  .map((file) => ({
    path: file,
    text: readFileSync(path.join(projectRoot, file), "utf8"),
  }));

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
    "@agent/provider-ollama-cloud",
    "@agent/tui",
    "@agent/cli",
  ],
  productSources: currentProductSources,
  applicationText: currentApplications,
};

function contextWithSources(...sources) {
  const replacements = new Map(sources.map((source) => [source.path, source]));
  const productSources = currentProductSources.map(
    (source) => replacements.get(source.path) ?? source,
  );
  for (const source of sources) {
    if (!currentProductSources.some((current) => current.path === source.path)) {
      productSources.push(source);
    }
  }
  return { ...emptyContext, productSources };
}

test("accepts the canonical blocked and direct provider registry", () => {
  assert.doesNotThrow(() => validateProviderPolicy(currentPolicy, emptyContext));
  assert.deepEqual(
    currentPolicy.providers.map((provider) => provider.id),
    ["chatgpt", "claude", "kimi", "grok"],
  );
  assert.deepEqual(
    currentPolicy.directProviders.map((provider) => provider.id),
    ["ollama-cloud"],
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

test("rejects drift in the admitted direct provider", () => {
  for (let index = 0; index < currentPolicy.directProviders.length; index += 1) {
    for (const [field, value] of [
      ["chatEndpoint", "https://example.com/v1"],
      ["catalogEndpoint", "https://example.com/v1/models"],
      ["credentialVariable", "UNREVIEWED_KEY"],
      ["credentialPersistence", "disk"],
    ]) {
      const drifted = structuredClone(currentPolicy);
      drifted.directProviders[index][field] = value;
      assert.throws(
        () => validateProviderPolicy(drifted, emptyContext),
        ProviderPolicyError,
      );
    }
  }

  for (const [field, value] of [
    ["catalogAuthentication", "anonymous"],
    ["modelAuthority", "static-repository-list"],
    ["modelCost", "free"],
    ["transport", "chat-completions-sse"],
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
    "code@moonshot.ai",
    "unverified@example.com",
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

test("rejects every dormant durable credential product surface", () => {
  const mutations = [
    {
      label: "dormant agent auth command",
      match: "forbidden",
      path: "packages/agent-cli/src/launch-command.ts",
      mutate: (text) => text.replace(
        'if (argument === "--help") {',
        'if (argument === "auth") {',
      ),
    },
    {
      label: "dormant agent auth command",
      match: "forbidden",
      path: "packages/agent-cli/src/launch-command.ts",
      mutate: (text) => text.replace(
        'if (argument === "--help") {',
        'if (argument === ["a", "uth"].join("")) {',
      ),
    },
    {
      label: "dormant credential namespace",
      match: "forbidden",
      path: "packages/agent-cli/src/workspace-boundary.ts",
      mutate: (text) => text.replace(
        'path.join(userStateRoot, "sessions")',
        'path.join(userStateRoot, "credentials")',
      ),
    },
    {
      label: "dormant credential namespace",
      match: "forbidden",
      path: "packages/agent-cli/src/workspace-boundary.ts",
      mutate: (text) => text.replace(
        'path.join(userStateRoot, "sessions")',
        'path.join(userStateRoot, ["cre", "dentials"].join(""))',
      ),
    },
    ...[
      "getCredential",
      "loadCredential",
      "openCredential",
      "readCredential",
      "resolveCredential",
    ].map((reader) => ({
      label: "sensitive-state identifier",
      match: "unregistered",
      path: "packages/agent-cli/src/provider-session.ts",
      mutate: (text) => text +
        "\nexport function " + reader + "(): undefined {\n" +
        "  return undefined;\n" +
        "}\n",
    })),
    ...[
      "loadSessionState",
      "openTokenStore",
      "readAuthState",
      "readSecretRecord",
    ].map((reader) => ({
      label: "sensitive-state identifier",
      match: "unregistered",
      path: "packages/agent-cli/src/provider-session.ts",
      mutate: (text) => text +
        "\nexport function " + reader + "(): undefined {\n" +
        "  return undefined;\n" +
        "}\n",
    })),
  ];

  for (const mutation of mutations) {
    const original = readFileSync(
      new URL("../../" + mutation.path, import.meta.url),
      "utf8",
    );
    assert.doesNotThrow(() =>
      validateProviderPolicy(currentPolicy, emptyContext),
    );
    const mutated = mutation.mutate(original);
    assert.notEqual(
      mutated,
      original,
      "mutation did not change " + mutation.path,
    );
    assert.throws(
      () =>
        validateProviderPolicy(
          currentPolicy,
          contextWithSources({ path: mutation.path, text: mutated }),
        ),
      (error) =>
        error instanceof ProviderPolicyError &&
        error.message ===
          mutation.path + " contains " + mutation.match + " " + mutation.label,
    );
  }
});

test("rejects new or expanded CLI filesystem authority", () => {
  const newSource = {
    path: "packages/agent-cli/src/local-state.ts",
    text:
      'import { readFile } from "node:fs/promises";\n' +
      "export async function loadState(path: string): Promise<string> {\n" +
      '  return readFile(path, "utf8");\n' +
      "}\n",
  };
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, contextWithSources(newSource)),
    ProviderPolicyError,
  );

  const path = "packages/agent-cli/src/workspace-boundary.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  assert.doesNotThrow(() =>
    validateProviderPolicy(currentPolicy, emptyContext),
  );
  const expanded = original.replace(
    'import { lstat, realpath } from "node:fs/promises";',
    'import { lstat, readFile, realpath } from "node:fs/promises";',
  );
  assert.notEqual(expanded, original);
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: expanded }),
      ),
    ProviderPolicyError,
  );

  const reduced = original.replace(
    'import { lstat, realpath } from "node:fs/promises";\n',
    "",
  );
  assert.notEqual(reduced, original);
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: reduced }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message === path + " contains CLI filesystem authority drift",
  );
});

test("rejects approved filesystem bindings re-exported to local modules", () => {
  const path = "packages/agent-cli/src/session-journal.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  for (const [reexport, importStatement] of [
    ["export { readFile };", 'import { readFile } from "./session-journal.js";'],
    [
      "export { readFile as localRead };",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      'export { readFile as "local-read" };',
      'import { "local-read" as readFile } from "./session-journal.js";',
    ],
    [
      "export const localRead = readFile;",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "export const localRead = readFile\n" +
        "export const marker = 1;",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "const firstRead = readFile;\n" +
        "const localRead = firstRead;\n" +
        "export { localRead };",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "export let localRead: typeof readFile = ((readFile));",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    ["export default readFile;", 'import readFile from "./session-journal.js";'],
    ["export default ((readFile));", 'import readFile from "./session-journal.js";'],
  ]) {
    const consumer = {
      path: "packages/agent-cli/src/local-state.ts",
      text:
        importStatement +
        "\nexport async function load(path: string): Promise<string> {\n" +
        '  return readFile(path, "utf8");\n' +
        "}\n",
    };
    assert.throws(
      () =>
        validateProviderPolicy(
          currentPolicy,
          contextWithSources(
            { path, text: original + "\n" + reexport + "\n" },
            consumer,
          ),
        ),
      (error) =>
        error instanceof ProviderPolicyError &&
        error.message ===
          path + " exports an approved CLI filesystem binding",
    );
  }
});

test("rejects destructured filesystem exports and admits default call results", () => {
  const path = "packages/agent-cli/src/session-journal.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({
          path,
          text: original +
            "\nexport const { localRead } = { localRead: readFile };\n",
        }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message === path + " contains an unscannable runtime export",
  );

  assert.doesNotThrow(() =>
    validateProviderPolicy(
      currentPolicy,
      contextWithSources({
        path,
        text: original + "\nexport default readFile(path);\n",
      }),
    ),
  );
});

test("rejects an allowed sensitive identifier at an unreviewed occurrence", () => {
  const path = "packages/agent-cli/src/session-journal.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  assert.doesNotThrow(() =>
    validateProviderPolicy(currentPolicy, emptyContext),
  );
  const mutated = original +
    "\nexport async function token(file: string): Promise<string> {\n" +
    '  return readFile(file, "utf8");\n' +
    "}\n";
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: mutated }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        path + " contains sensitive-state identifier occurrence drift",
  );
  const reduced = original.replace("let sessionState:", "let state:");
  assert.notEqual(reduced, original);
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: reduced }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        path + " contains sensitive-state identifier occurrence drift",
  );
});

test("rejects missing paths from the closed source inventories", () => {
  const sensitivePath = "packages/agent-cli/src/notice.ts";
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        productSources: currentProductSources.filter(
          (source) => source.path !== sensitivePath,
        ),
      }),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        "sensitive-state identifier inventory path is missing from product sources: " +
          sensitivePath,
  );

  const filesystemPath = "packages/agent-cli/src/workspace-boundary.ts";
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        productSources: currentProductSources.filter(
          (source) => source.path !== filesystemPath,
        ),
      }),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        "CLI filesystem authority inventory path is missing from product sources: " +
          filesystemPath,
  );
});

test("fails closed when static string projection exceeds its bounds", () => {
  const path = "packages/agent-cli/src/provider-session.ts";
  const fragments = Array.from({ length: 33 }, () => '"a"').join(", ");
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({
            path,
            text: "const value = [" + fragments + '].join("");\n',
        }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        path + " contains an unscannable static string expression",
  );
});

test("accepts only the exact current CLI filesystem authorities", () => {
  assert.doesNotThrow(() =>
    validateProviderPolicy(currentPolicy, emptyContext),
  );
});

test("allows only the reviewed direct-provider literals in their exact files", () => {
  const admitted = [
    "packages/agent-cli/src/node-ollama-cloud-transport.ts",
    "packages/agent-cli/src/node-ollama-model-catalog.ts",
  ].map((path) => ({
    path,
    text: readFileSync(new URL("../../" + path, import.meta.url), "utf8"),
  }));
  assert.doesNotThrow(() =>
    validateProviderPolicy(currentPolicy, emptyContext),
  );

  for (const source of admitted) {
    assert.throws(
      () =>
        validateProviderPolicy(
          currentPolicy,
          contextWithSources({
            path: "packages/example/src/provider.ts",
            text: source.text,
          }),
        ),
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
        validateProviderPolicy(
          currentPolicy,
          contextWithSources({ path: "packages/example/src/provider.ts", text }),
        ),
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
        validateProviderPolicy(currentPolicy, contextWithSources(source)),
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
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path: "packages/example/src/local.ts", text }),
      ),
    );
  }
});
