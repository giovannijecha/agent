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
const emptyContext = {
  workspaceNames: [
    "@agent/core",
    "@agent/tools",
    "@agent/runtime",
    "@agent/provider-ollama-cloud",
    "@agent/provider-openai-subscription",
    "@agent/tui",
    "@agent/cli",
  ],
  productSources: currentProductSources,
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

test("accepts the canonical compatibility, blocked, and direct provider registry", () => {
  assert.doesNotThrow(() => validateProviderPolicy(currentPolicy, emptyContext));
  assert.deepEqual(
    currentPolicy.providers.map((provider) => provider.id),
    ["chatgpt", "claude", "kimi", "grok"],
  );
  assert.deepEqual(
    currentPolicy.directProviders.map((provider) => provider.id),
    ["ollama-cloud"],
  );
  assert.deepEqual(currentPolicy.subscriptionCompatibility, {
    state: "accepted-runtime-inactive",
    providers: ["chatgpt", "kimi", "grok"],
    registrationAuthority: "provider-owned-non-secret-public-client",
    callerIdentity: "agent",
    disclosure: "independent-compatibility-not-provider-endorsement",
    foreignCredentialImport: "forbidden",
    foreignRuntime: "forbidden",
    implementation: "owned-zero-dependency-provider-specific",
    researchedOn: "2026-08-21",
  });
  assert.deepEqual(
    currentPolicy.providers.map((provider) => provider.blocker),
    [
      "runtime-integration-required",
      "independent-client-authorization-required",
      "compatibility-contract-required",
      "compatibility-contract-required",
    ],
  );
});

test("binds OpenAI authentication and inactive provider transport", () => {
  assert.deepEqual(currentPolicy.subscriptionContracts, [
    {
      id: "chatgpt",
      state: "transport-compatible-inactive",
      flow: "openai-device-code-plus-oauth-pkce",
      issuer: "https://auth.openai.com",
      deviceCodeEndpoint:
        "https://auth.openai.com/api/accounts/deviceauth/usercode",
      devicePollingEndpoint:
        "https://auth.openai.com/api/accounts/deviceauth/token",
      deviceVerificationEndpoint: "https://auth.openai.com/codex/device",
      tokenEndpoint: "https://auth.openai.com/oauth/token",
      revocationEndpoint: "https://auth.openai.com/oauth/revoke",
      catalogEndpoint: "https://chatgpt.com/backend-api/codex/models",
      chatEndpoint: "https://chatgpt.com/backend-api/codex/responses",
      clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
      clientType: "provider-owned-non-secret-public-client",
      clientIdentityAuthority: "provider-owned-public-client-compatibility",
      callerIdentity: "agent",
      authOriginator: "omitted",
      authUserAgent: "agent",
      deviceRequestFields: ["client_id"],
      requestedScopes: [],
      deviceRedirect: "https://auth.openai.com/deviceauth/callback",
      devicePollPendingStatuses: [403, 404],
      devicePollSuccess: "success-status-with-bounded-code-object",
      devicePollTerminal: "all-other-status",
      tokenEndpointAuthMethod: "none",
      pkceMethod: "S256",
      disclosure: "independent-compatibility-not-provider-endorsement",
      clientRegistrationEndpoint: null,
      credentialRecord: "~/.agent/credentials/openai.oauth",
      credentialRecoveryRecords: [
        "~/.agent/credentials/.openai.oauth.pending",
        "~/.agent/credentials/.openai.oauth.retired",
      ],
      credentialEnvironment: null,
      credentialAdmission: "exclusive-session-and-mutation",
      credentialCommand: "agent auth",
      authCapability: "device-login-relogin-local-remove",
      providerRuntime: "inactive",
      refreshRuntime: "inactive",
      revocationRuntime: "inactive",
      deviceResponseFields: ["device_auth_id", "user_code", "interval"],
      deviceOptionalResponseFields: ["expires_at"],
      deviceExpirationBytes: 256,
      deviceIntervalEncoding: "canonical-decimal-string",
      deviceIntervalSeconds: { minimum: 1, maximum: 30 },
      pollRequestFields: ["device_auth_id", "user_code"],
      pollResponseFields: ["authorization_code", "code_verifier"],
      pollOptionalResponseFields: ["code_challenge"],
      pollAdditionalResponseMembers: "bounded-discarded-after-complete-decode",
      tokenRequestFields: [
        "grant_type",
        "code",
        "redirect_uri",
        "client_id",
        "code_verifier",
      ],
      tokenResponseFields: ["id_token", "access_token", "refresh_token"],
      accountClaimNamespace: "https://api.openai.com/auth",
      accountClaim: "chatgpt_account_id",
      expirationClaim: "exp",
      authenticationDeadlineMilliseconds: 900000,
      challengePresentation: "deadline-and-cancellation-bounded",
      firstPoll: "immediate",
      credentialRemoval: "local-only-no-provider-revocation",
      credentialProtocol: {
        requestKinds: [7, 8, 9, 10, 11, 12],
        responseKind: 13,
        envelopeBytes: 20,
        maxPayloadBytes: 65812,
        headerBytes: 256,
        maxRecordBytes: 66048,
        payloadSyntax: "visible-ascii-0x21-0x7e",
        revisionOwner: "native-broker",
      },
      transportWorkspace: "@agent/provider-openai-subscription",
      transportComposition: "inactive",
      catalogRequest: {
        method: "GET",
        query: "client_version=0.1.0",
        headers: [
          "Accept: application/json",
          "Authorization: Bearer <credential>",
          "ChatGPT-Account-ID: <account>",
          "originator: agent",
          "User-Agent: agent/0.1.0",
        ],
        body: "absent",
      },
      catalogResponse: {
        status: 200,
        contentType: "application/json; optional charset=utf-8",
        rootFields: ["models"],
        entryFields: ["slug", "visibility", "supported_in_api"],
        eligibility: "visibility-list-and-supported-in-api-true",
        maximumBodyBytes: 1048576,
        maximumModels: 256,
      },
      responsesRequest: {
        method: "POST",
        headers: [
          "Accept: text/event-stream",
          "Authorization: Bearer <credential>",
          "ChatGPT-Account-ID: <account>",
          "Content-Type: application/json",
          "originator: agent",
          "User-Agent: agent/0.1.0",
        ],
        rootFields: [
          "model",
          "instructions",
          "input",
          "tools",
          "tool_choice",
          "parallel_tool_calls",
          "reasoning",
          "store",
          "stream",
          "include",
        ],
        toolChoice: "auto",
        parallelToolCalls: false,
        store: false,
        stream: true,
        include: [],
        opaqueReasoningState: "not-requested-or-retained",
        maximumBodyCodeUnits: 8388608,
      },
      responsesStream: {
        status: 200,
        contentType: "text/event-stream; optional charset=utf-8",
        maximumEvents: 16384,
        maximumEventCodeUnits: 1048576,
        maximumReasoningCodeUnits: 1048576,
        maximumArgumentCodeUnits: 1048576,
        maximumFunctionCalls: 32,
      },
      modelAuthority: "authenticated-catalog",
      transport: "openai-responses-sse",
      evidence: "https://learn.chatgpt.com/docs/app-server",
      identityEvidence:
        "https://github.com/openai/codex/tree/536f86e5cc9ec1ff38457d099bf320b9d08eeeba",
      researchedOn: "2026-08-21",
    },
  ]);
});

test("rejects drift that would activate or misidentify the OpenAI OAuth contract", () => {
  for (const [field, value] of [
    ["state", "enabled"],
    ["clientId", "foreign-application"],
    ["clientType", "agent-owned-client"],
    ["clientIdentityAuthority", "borrowed-codex-client"],
    ["callerIdentity", "pi"],
    ["authOriginator", "codex_cli_rs"],
    ["authUserAgent", "codex"],
    ["deviceRequestFields", ["client_id", "scope"]],
    ["deviceOptionalResponseFields", []],
    ["deviceExpirationBytes", 257],
    ["requestedScopes", ["openid"]],
    ["deviceRedirect", "http://localhost:1455/auth/callback"],
    ["devicePollPendingStatuses", [404]],
    ["pollOptionalResponseFields", []],
    ["pollAdditionalResponseMembers", "rejected"],
    ["challengePresentation", "unbounded"],
    ["tokenEndpointAuthMethod", "client_secret_post"],
    ["pkceMethod", "plain"],
    ["disclosure", "official-openai-client"],
    ["clientRegistrationEndpoint", "https://example.com/register"],
    ["credentialAdmission", "shared-session"],
    ["credentialEnvironment", "OPENAI_TOKEN"],
    ["credentialRecoveryRecords", []],
    ["credentialProtocol", { requestKinds: [7] }],
    ["chatEndpoint", "https://api.openai.com/v1/responses"],
  ]) {
    const drifted = structuredClone(currentPolicy);
    drifted.subscriptionContracts[0][field] = value;
    assert.throws(
      () => validateProviderPolicy(drifted, emptyContext),
      ProviderPolicyError,
    );
  }
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
      ["credentialCommand", "agent login"],
      ["credentialRecord", "~/.agent/credentials/provider.key"],
      ["credentialAdmission", "unlocked"],
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

test("rejects stale provider research", () => {
  const stalePolicy = structuredClone(currentPolicy);
  stalePolicy.researchedOn = "2026-08-07";
  assert.throws(
    () => validateProviderPolicy(stalePolicy, emptyContext),
    ProviderPolicyError,
  );
});

test("rejects submission-record drift", () => {
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

});

test("rejects response-record drift", () => {
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

test("rejects every second or unregistered credential authority", () => {
  const mutations = [
    {
      failure:
        "packages/agent-cli/src/launch-command.ts contains " +
        "sensitive-state identifier occurrence drift",
      path: "packages/agent-cli/src/launch-command.ts",
      mutate: (text) => text.replace(
        'if (argument === "--help") {',
        'if (argument === "auth") {',
      ),
    },
    {
      failure: "CLI product tree source-integrity drift",
      path: "packages/agent-cli/src/launch-command.ts",
      mutate: (text) => text.replace(
        'if (argument === "--help") {',
        'if (argument === ["a", "uth"].join("")) {',
      ),
    },
    {
      failure:
        "packages/agent-cli/src/workspace-boundary.ts contains " +
        "sensitive-state identifier occurrence drift",
      path: "packages/agent-cli/src/workspace-boundary.ts",
      mutate: (text) => text.replace(
        'path.join(userStateRoot, "sessions")',
        'path.join(userStateRoot, "credentials")',
      ),
    },
    {
      failure:
        "CLI product tree source-integrity drift",
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
      failure:
        "packages/agent-cli/src/provider-session.ts contains unregistered " +
        "sensitive-state identifier",
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
      failure:
        "packages/agent-cli/src/provider-session.ts contains unregistered " +
        "sensitive-state identifier",
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
        error.message === mutation.failure,
    );
  }
});

test("rejects unsupported command composition through source integrity", () => {
  const path = "packages/agent-cli/src/launch-command.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  const mutated = original.replace(
    'if (argument === "--help") {',
    'if (argument === "a".concat("uth")) {',
  );
  assert.notEqual(mutated, original);
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: mutated }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        "CLI product tree source-integrity drift",
  );
});

test("pins the exact CLI product tree", () => {
  const sources = currentProductSources.filter((source) =>
    /^packages\/agent-cli\/src\/(?:[^/]+\/)*[^/]+\.ts$/u.test(source.path)
  );
  assert.equal(sources.length, 77);
  const unprivilegedSource = sources.find(
    (source) => source.path === "packages/agent-cli/src/models-view.ts",
  );
  assert.notEqual(unprivilegedSource, undefined);
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({
          path: unprivilegedSource.path,
          text: unprivilegedSource.text + "\n// unreviewed activation drift\n",
        }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message === "CLI product tree source-integrity drift",
  );

  const missingPath = "packages/agent-cli/src/launch-command.ts";
  assert.throws(
    () =>
      validateProviderPolicy(currentPolicy, {
        ...emptyContext,
        productSources: currentProductSources.filter(
          (source) => source.path !== missingPath,
        ),
      }),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message === "CLI product tree path drift",
  );

  const addedSource = {
    path: "packages/agent-cli/src/alternate-auth.ts",
    text: "export const alternate = true;\n",
  };
  assert.throws(
    () => validateProviderPolicy(currentPolicy, contextWithSources(addedSource)),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message === "CLI product tree path drift",
  );

  const nestedSource = {
    path: "packages/agent-cli/src/alternate/entry.ts",
    text: 'export const command = "a".concat("uth");\n',
  };
  assert.throws(
    () => validateProviderPolicy(currentPolicy, contextWithSources(nestedSource)),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message === "CLI product tree path drift",
  );
});

test("rejects new or expanded CLI Node effect authority", () => {
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
  const newProcessSource = {
    path: "packages/agent-cli/src/local-process.ts",
    text:
      'import { spawn } from "node:child_process";\n' +
      "export function launch(): void {\n" +
      "  spawn('/bin/sh', []);\n" +
      "}\n",
  };
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources(newProcessSource),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        newProcessSource.path +
          " contains unregistered CLI Node effect authority",
  );
  const newNetworkSource = {
    path: "packages/agent-cli/src/local-network.ts",
    text:
      'import { request } from "node:https";\n' +
      "export function open(): void {\n" +
      "  request({});\n" +
      "}\n",
  };
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources(newNetworkSource),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        newNetworkSource.path +
          " contains unregistered CLI Node effect authority",
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
      error.message === path + " contains CLI Node effect authority drift",
  );
});

test("rejects reviewed filesystem escape recurrences as source drift", () => {
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
      "const localRead = (readFile as typeof readFile);\n" +
        "export { localRead };",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "const localRead = <typeof readFile>readFile;\n" +
        "export { localRead };",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "export const ordinary: Map<string, { value: string }> = new Map(), " +
        "localRead = readFile;",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "export let localRead: typeof readFile = ((readFile));",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "let localRead: typeof readFile;\n" +
        "localRead = readFile;\n" +
        "export { localRead };",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "const type = readFile;\nexport { type as localRead };",
      'import { localRead as readFile } from "./session-journal.js";',
    ],
    [
      "const 讀取 = readFile;\nexport { 讀取 };",
      'import { 讀取 as readFile } from "./session-journal.js";',
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
          "CLI product tree path drift",
    );
  }
});

test("registers every direct CLI Node effect authority", () => {
  const expectedPaths = [
    "packages/agent-cli/src/builtin-tools.ts",
    "packages/agent-cli/src/credential-broker.ts",
    "packages/agent-cli/src/node-ollama-cloud-transport.ts",
    "packages/agent-cli/src/node-ollama-model-catalog.ts",
    "packages/agent-cli/src/node-openai-device-auth.ts",
    "packages/agent-cli/src/node-openai-provider-transport.ts",
    "packages/agent-cli/src/node-process-runner.ts",
    "packages/agent-cli/src/platform-clipboard.ts",
    "packages/agent-cli/src/platform-workspace-mutation.ts",
    "packages/agent-cli/src/platform-workspace-namespace.ts",
    "packages/agent-cli/src/platform-workspace-roots.ts",
    "packages/agent-cli/src/session-journal.ts",
    "packages/agent-cli/src/workspace-boundary.ts",
    "packages/agent-cli/src/workspace-mutation-plans.ts",
    "packages/agent-cli/src/workspace-namespace-plans.ts",
    "packages/agent-cli/src/workspace-path.ts",
    "packages/agent-cli/src/workspace-read-policy.ts",
  ];
  const sources = currentProductSources.filter((source) =>
    source.path.startsWith("packages/agent-cli/src/") &&
    /["']node:(?:child_process|fs(?:\/promises)?|https)["']/u.test(source.text)
  );
  assert.deepEqual(
    sources.map((source) => source.path).sort(),
    expectedPaths,
  );
});

test("rejects unreviewed child-process launch behavior", () => {
  const path = "packages/agent-cli/src/platform-workspace-roots.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  const mutated = original +
    "\nspawn('/bin/sh', ['-c', " +
    "'cat ~/.agent/cred'.concat('entials')]);\n";
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: mutated }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        "CLI product tree source-integrity drift",
  );
});

test("normalizes approved CLI boundary source line endings", () => {
  const path = "packages/agent-cli/src/session-journal.ts";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  assert.doesNotThrow(() =>
    validateProviderPolicy(
      currentPolicy,
      contextWithSources({
        path,
        text: original.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"),
      }),
    ),
  );

  const activationPath = "packages/agent-cli/src/launch-command.ts";
  const activationOriginal = readFileSync(
    new URL("../../" + activationPath, import.meta.url),
    "utf8",
  );
  assert.doesNotThrow(() =>
    validateProviderPolicy(
      currentPolicy,
      contextWithSources({
        path: activationPath,
        text: activationOriginal
          .replaceAll("\r\n", "\n")
          .replaceAll("\n", "\r\n"),
      }),
    ),
  );

  const nativePath = "packages/agent-cli/native/workspace-roots/main.c";
  const nativeOriginal = readFileSync(
    new URL("../../" + nativePath, import.meta.url),
    "utf8",
  );
  assert.doesNotThrow(() =>
    validateProviderPolicy(
      currentPolicy,
      contextWithSources({
        path: nativePath,
        text: nativeOriginal
          .replaceAll("\r\n", "\n")
          .replaceAll("\n", "\r\n"),
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

test("pins the exact CLI native platform source tree", () => {
  const path = "packages/agent-cli/native/workspace-roots/main.c";
  const original = readFileSync(
    new URL("../../" + path, import.meta.url),
    "utf8",
  );
  assert.throws(
    () =>
      validateProviderPolicy(
        currentPolicy,
        contextWithSources({ path, text: original + "\n/* source drift */\n" }),
      ),
    (error) =>
      error instanceof ProviderPolicyError &&
      error.message ===
        "CLI native platform authority source-integrity drift",
  );

  for (const productSources of [
    currentProductSources.filter((source) => source.path !== path),
    [
      ...currentProductSources,
      {
        path: "packages/agent-cli/native/unregistered.c",
        text: "int unregistered(void) { return 0; }\n",
      },
    ],
  ]) {
    assert.throws(
      () =>
        validateProviderPolicy(currentPolicy, {
          ...emptyContext,
          productSources,
        }),
      (error) =>
        error instanceof ProviderPolicyError &&
        error.message === "CLI native platform authority path drift",
    );
  }
});

test("accepts only the exact current CLI boundary authorities", () => {
  assert.doesNotThrow(() =>
    validateProviderPolicy(currentPolicy, emptyContext),
  );
});

test("allows only the reviewed direct-provider literals in their exact files", () => {
  const admitted = [
    "packages/agent-cli/src/auth-command.ts",
    "packages/agent-cli/src/node-ollama-cloud-transport.ts",
    "packages/agent-cli/src/node-ollama-model-catalog.ts",
    "packages/agent-cli/src/node-openai-device-auth.ts",
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
