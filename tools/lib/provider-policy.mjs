import { createHash } from "node:crypto";

export const PROVIDER_POLICY_SCHEMA_VERSION = 15;

const OPENAI_SUBMISSION_URL =
  "https://community.openai.com/t/independent-native-oauth-public-client-registration-request-for-agent/1389585";
const CLAUDE_SUBMISSION_REFERENCE =
  "anthropic-support-messenger-2026-08-08";
const KIMI_SUBMISSION_REFERENCE = "kimi-support-email-2026-08-08";
const KIMI_RESPONSE_REFERENCE = "kimi-support-response-2026-08-11";
const XAI_SUBMISSION_REFERENCE = "xai-support-email-2026-08-08";

const EXPECTED_PROVIDERS = [
  {
    id: "chatgpt",
    displayName: "ChatGPT Plus/Pro",
    eligibility: "blocked",
    blocker: "runtime-integration-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "openai-developer-forum",
      visibility: "public",
      submittedOn: "2026-08-08",
      reference: OPENAI_SUBMISSION_URL,
      response: null,
    },
  },
  {
    id: "claude",
    displayName: "Claude Pro/Max",
    eligibility: "blocked",
    blocker: "independent-client-authorization-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "anthropic-support-messenger",
      visibility: "private",
      submittedOn: "2026-08-08",
      reference: CLAUDE_SUBMISSION_REFERENCE,
      response: null,
    },
  },
  {
    id: "kimi",
    displayName: "Kimi Code",
    eligibility: "blocked",
    blocker: "compatibility-contract-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "kimi-code-support-email",
      visibility: "private",
      submittedOn: "2026-08-08",
      reference: KIMI_SUBMISSION_REFERENCE,
      response: {
        state: "received",
        receivedOn: "2026-08-11",
        outcome: "public-oauth-unavailable",
        reference: KIMI_RESPONSE_REFERENCE,
      },
    },
  },
  {
    id: "grok",
    displayName: "Grok subscription",
    eligibility: "blocked",
    blocker: "compatibility-contract-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "xai-product-support-email",
      visibility: "private",
      submittedOn: "2026-08-08",
      reference: XAI_SUBMISSION_REFERENCE,
      response: null,
    },
  },
];

const EXPECTED_DIRECT_PROVIDERS = [
  {
    id: "ollama-cloud",
    displayName: "Ollama Cloud",
    eligibility: "enabled",
    authorization: "direct-api-key",
    credentialVariable: "AGENT_OLLAMA_API_KEY",
    credentialCommand: "agent auth",
    credentialRecord: "~/.agent/credentials/ollama-cloud.api-key",
    credentialAdmission: "shared-session-exclusive-mutation",
    credentialPersistence: "owned-provider-record-or-environment",
    chatEndpoint: "https://ollama.com/api/chat",
    catalogEndpoint: "https://ollama.com/api/tags",
    catalogAuthentication: "bearer-api-key",
    modelAuthority: "authenticated-catalog",
    modelCost: "cloud",
    transport: "ollama-chat-application-json-stream",
    evidence: "https://docs.ollama.com/cloud",
    researchedOn: "2026-08-16",
  },
];

const EXPECTED_SUBSCRIPTION_COMPATIBILITY = {
  decision: "0091",
  state: "accepted-runtime-inactive",
  providers: ["chatgpt", "kimi", "grok"],
  registrationAuthority: "provider-owned-non-secret-public-client",
  callerIdentity: "agent",
  disclosure: "independent-compatibility-not-provider-endorsement",
  foreignCredentialImport: "forbidden",
  foreignRuntime: "forbidden",
  implementation: "owned-zero-dependency-provider-specific",
  researchedOn: "2026-08-21",
};

const EXPECTED_SUBSCRIPTION_CONTRACTS = [
  {
    id: "chatgpt",
    decision: "0090",
    identityDecision: "0092",
    credentialDecision: "0093",
    authDecision: "0094",
    transportDecision: "0095",
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
];

const APPLICATION_DOCUMENT = "docs/PROVIDER-APPLICATIONS.md";
const RESEARCH_DATE = "2026-08-08";
const APPLICATION_HEADINGS = [
  "Submission rules",
  ...EXPECTED_PROVIDERS.map((provider) => provider.displayName),
  "Maintenance and removal",
];
const REQUEST_HEADINGS = [
  "Status",
  "Official route",
  "Subject",
  "Request",
  "Public attachments",
  "Required written answer",
  "Do not include",
  "Official evidence",
];
const ALLOWED_APPLICATION_EMAILS = new Set([
  "code@moonshot.ai",
  "support@x.ai",
]);
const PUBLIC_ATTACHMENT_URLS = [
  "https://github.com/giovannijecha/agent",
  "https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md",
  "https://github.com/giovannijecha/agent/blob/main/PRIVACY.md",
  "https://github.com/giovannijecha/agent/blob/main/SECURITY.md",
];
const OFFICIAL_ROUTE_MARKERS = Object.freeze({
  chatgpt: "https://community.openai.com/",
  claude: "https://support.claude.com/en/articles/9015913-how-to-get-support",
  kimi: "code@moonshot.ai",
  grok: "support@x.ai",
});
const OFFICIAL_EVIDENCE_URLS = Object.freeze({
  chatgpt: [
    "https://developers.openai.com/codex/auth/",
    "https://developers.openai.com/codex/app-server/",
    "https://developers.openai.com/community",
  ],
  claude: [
    "https://code.claude.com/docs/en/authentication",
    "https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan",
    "https://support.claude.com/en/articles/9015913-how-to-get-support",
  ],
  kimi: [
    "https://www.kimi.com/code/docs/en/",
    "https://www.kimi.com/code/docs/en/kimi-code/contact-and-feedback.html",
  ],
  grok: [
    "https://docs.x.ai/build/overview",
    "https://docs.x.ai/build/enterprise",
    "https://x.ai/contact",
  ],
});

const EXPECTED_WORKSPACES = [
  "@agent/core",
  "@agent/tools",
  "@agent/runtime",
  "@agent/provider-ollama-cloud",
  "@agent/provider-openai-subscription",
  "@agent/tui",
  "@agent/cli",
];

const APPROVED_SOURCE_LITERALS = Object.freeze({
  "packages/agent-provider-openai-subscription/src/catalog.ts": [
    "OpenAI",
    "openai",
  ],
  "packages/agent-provider-openai-subscription/src/errors.ts": [
    "OpenAI",
    "openai",
  ],
  "packages/agent-provider-openai-subscription/src/index.ts": [
    "OpenAI",
    "openai",
  ],
  "packages/agent-provider-openai-subscription/src/limits.ts": ["OPENAI", "OpenAI"],
  "packages/agent-provider-openai-subscription/src/model.ts": [
    "OpenAI",
    "openai",
  ],
  "packages/agent-provider-openai-subscription/src/models.ts": ["OpenAI"],
  "packages/agent-provider-openai-subscription/src/transport.ts": ["OpenAI"],
  "packages/agent-provider-openai-subscription/src/wire.ts": [
    "OpenAI",
    "openai",
  ],
  "packages/agent-provider-openai-subscription/test/model.test.ts": [
    "OpenAI",
    "openai",
  ],
  "packages/agent-cli/src/auth-command.ts": ["OpenAI", "openAI", "openai"],
  "packages/agent-cli/native/credential-broker/credential-store.c": [
    "OPENAI",
    "openai",
    "oauth",
  ],
  "packages/agent-cli/native/credential-broker/credential-store.h": [
    "OPENAI",
  ],
  "packages/agent-cli/native/credential-broker/main.c": ["OPENAI"],
  "packages/agent-cli/src/credential-broker-protocol.ts": [
    "OpenAI",
    "openAI",
    "accessToken",
    "refreshToken",
  ],
  "packages/agent-cli/src/credential-broker.ts": ["OpenAI", "openAI"],
  "packages/agent-cli/src/main.ts": ["OpenAI"],
  "packages/agent-cli/src/node-openai-device-auth.ts": [
    "OPENAI",
    "OpenAI",
    "openAI",
    "openai",
    "oauth",
    "CLIENT_ID",
    "client_id",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
  ],
  "packages/agent-cli/src/node-openai-provider-transport.ts": [
    "OPENAI",
    "OpenAI",
    "openai",
    "ChatGPT",
    "chatgpt",
    "chatgpt.com/backend-api",
    "accessToken",
    "Bearer",
  ],
  "packages/agent-cli/test/credential-broker-protocol.test.ts": [
    "OpenAI",
    "openAI",
    "accessToken",
    "refreshToken",
  ],
  "packages/agent-cli/test/credential-broker.test.ts": [
    "OpenAI",
    "openAI",
    "accessToken",
    "refreshToken",
  ],
  "packages/agent-cli/test/auth-command.test.ts": [
    "OpenAI",
    "openAI",
    "openai",
    "accessToken",
    "refreshToken",
  ],
  "packages/agent-cli/test/node-openai-device-auth.test.ts": [
    "OPENAI",
    "OpenAI",
    "openai",
    "oauth",
    "PKCE",
    "client_id",
    "access_token",
    "refresh_token",
  ],
  "packages/agent-cli/test/node-openai-provider-transport.test.ts": [
    "OPENAI",
    "OpenAI",
    "openai",
    "chatgpt",
    "accessToken",
    "refreshToken",
    "Bearer",
  ],
  "packages/agent-cli/src/node-ollama-cloud-transport.ts": ["Bearer "],
  "packages/agent-cli/test/node-ollama-cloud-transport.test.ts": ["Bearer "],
  "packages/agent-cli/src/node-ollama-model-catalog.ts": ["Bearer "],
  "packages/agent-cli/test/node-ollama-model-catalog.test.ts": ["Bearer "],
});

const EXPECTED_SENSITIVE_STATE_OCCURRENCES = Object.freeze({
  "packages/agent-provider-openai-subscription/src/catalog.ts": "authenticated=1",
  "packages/agent-provider-openai-subscription/src/models.ts": "authenticated=1",
  "packages/agent-provider-openai-subscription/test/model.test.ts": "authenticated=1",
  "packages/agent-cli/native/credential-broker/credential-store.c": "AGENT_CREDENTIAL_ABSENT=1;AGENT_CREDENTIAL_BUSY=1;AGENT_CREDENTIAL_CANCEL=1;AGENT_CREDENTIAL_CANCELLED=1;AGENT_CREDENTIAL_DUAL_AUTHORITY=1;AGENT_CREDENTIAL_FIXTURE=11;AGENT_CREDENTIAL_HEADER_MAX_BYTES=8;AGENT_CREDENTIAL_INVALID_STATE=4;AGENT_CREDENTIAL_INVALID_VALUE=2;AGENT_CREDENTIAL_KEY_MAX_BYTES=8;AGENT_CREDENTIAL_MAX_REVISION=8;AGENT_CREDENTIAL_OLLAMA_RECORD_MAX_BYTES=4;AGENT_CREDENTIAL_OPEN_MUTATION=2;AGENT_CREDENTIAL_OPENAI_ACCOUNT_MAX_BYTES=3;AGENT_CREDENTIAL_OPENAI_CANCEL=1;AGENT_CREDENTIAL_OPENAI_ENVELOPE_BYTES=8;AGENT_CREDENTIAL_OPENAI_OPEN_MUTATION=2;AGENT_CREDENTIAL_OPENAI_PAYLOAD_MAX_BYTES=1;AGENT_CREDENTIAL_OPENAI_RECORD_MAX_BYTES=6;AGENT_CREDENTIAL_OPENAI_REGISTER=1;AGENT_CREDENTIAL_OPENAI_REMOVE=1;AGENT_CREDENTIAL_OPENAI_REPLACE=1;AGENT_CREDENTIAL_OPENAI_SNAPSHOT=1;AGENT_CREDENTIAL_OPENAI_VALUE=1;AGENT_CREDENTIAL_PRESENT=1;agent_credential_profile=6;AGENT_CREDENTIAL_PROFILE_OLLAMA=17;AGENT_CREDENTIAL_PROFILE_OPENAI=4;AGENT_CREDENTIAL_REGISTER=1;AGENT_CREDENTIAL_REGISTERED=1;AGENT_CREDENTIAL_REMOVE=1;AGENT_CREDENTIAL_REMOVED=1;AGENT_CREDENTIAL_REPLACE=1;AGENT_CREDENTIAL_REPLACED=1;agent_credential_request_kind=2;agent_credential_response_kind=2;agent_credential_session=21;AGENT_CREDENTIAL_SNAPSHOT=1;agent_credential_store_close=22;AGENT_CREDENTIAL_STORE_FAILURE=6;agent_credential_store_mutate=1;agent_credential_store_open=1;AGENT_CREDENTIAL_VALUE=1;credential=5;credentials=31;GetTokenInformation=2;oauth=19;OpenProcessToken=1;token=6;TOKEN_QUERY=1;TOKEN_USER=1;TokenUser=2",
  "packages/agent-cli/native/credential-broker/credential-store.h": "AGENT_CREDENTIAL_ABSENT=1;AGENT_CREDENTIAL_BUSY=1;AGENT_CREDENTIAL_CANCEL=1;AGENT_CREDENTIAL_CANCELLED=1;AGENT_CREDENTIAL_DUAL_AUTHORITY=1;AGENT_CREDENTIAL_INVALID_STATE=1;AGENT_CREDENTIAL_INVALID_VALUE=1;AGENT_CREDENTIAL_KEY_MAX_BYTES=1;AGENT_CREDENTIAL_OPEN_MUTATION=1;AGENT_CREDENTIAL_OPENAI_ACCOUNT_MAX_BYTES=1;AGENT_CREDENTIAL_OPENAI_CANCEL=1;AGENT_CREDENTIAL_OPENAI_OPEN_MUTATION=1;AGENT_CREDENTIAL_OPENAI_PAYLOAD_MAX_BYTES=1;AGENT_CREDENTIAL_OPENAI_REGISTER=1;AGENT_CREDENTIAL_OPENAI_REMOVE=1;AGENT_CREDENTIAL_OPENAI_REPLACE=1;AGENT_CREDENTIAL_OPENAI_SNAPSHOT=1;AGENT_CREDENTIAL_OPENAI_VALUE=1;AGENT_CREDENTIAL_PRESENT=1;AGENT_CREDENTIAL_REGISTER=1;AGENT_CREDENTIAL_REGISTERED=1;AGENT_CREDENTIAL_REMOVE=1;AGENT_CREDENTIAL_REMOVED=1;AGENT_CREDENTIAL_REPLACE=1;AGENT_CREDENTIAL_REPLACED=1;agent_credential_request_kind=3;agent_credential_response_kind=3;agent_credential_session=4;AGENT_CREDENTIAL_SNAPSHOT=1;agent_credential_store_close=1;AGENT_CREDENTIAL_STORE_FAILURE=1;AGENT_CREDENTIAL_STORE_H=2;agent_credential_store_mutate=1;agent_credential_store_open=1;AGENT_CREDENTIAL_VALUE=1",
  "packages/agent-cli/native/credential-broker/main.c": "AGENT_CREDENTIAL_ABSENT=1;AGENT_CREDENTIAL_HEADER_BYTES=3;AGENT_CREDENTIAL_KEY_MAX_BYTES=1;AGENT_CREDENTIAL_OPEN_MUTATION=3;AGENT_CREDENTIAL_OPENAI_CANCEL=1;AGENT_CREDENTIAL_OPENAI_OPEN_MUTATION=2;AGENT_CREDENTIAL_OPENAI_PAYLOAD_MAX_BYTES=2;AGENT_CREDENTIAL_OPENAI_REGISTER=1;AGENT_CREDENTIAL_OPENAI_REPLACE=1;AGENT_CREDENTIAL_OPENAI_SNAPSHOT=3;AGENT_CREDENTIAL_OPENAI_VALUE=2;AGENT_CREDENTIAL_PRESENT=1;AGENT_CREDENTIAL_REGISTER=2;AGENT_CREDENTIAL_REPLACE=1;agent_credential_request=5;agent_credential_request_kind=2;agent_credential_response_kind=2;agent_credential_session=1;AGENT_CREDENTIAL_SNAPSHOT=4;agent_credential_store_close=5;AGENT_CREDENTIAL_STORE_FAILURE=1;agent_credential_store_mutate=1;agent_credential_store_open=1;AGENT_CREDENTIAL_VALUE=3;credential=1",
  "packages/agent-cli/native/process-broker/backend-linux.c": "agent_linux_token_present=2;token=3;token_length=3",
  "packages/agent-cli/src/application.ts": "activeAuthenticated=3;auth=2;authenticated=12;authentication=6;createNoticeToken=2;noticeToken=6;NoticeToken=4;token=2",
  "packages/agent-cli/src/auth-command.ts": "auth=2;AuthCancellationMonitor=2;AuthCancellationStarter=2;AuthCommandDependencies=4;AuthCommandError=10;AuthCommandResult=6;AuthCredentialOpener=3;authenticate=2;authenticated=7;authentication=6;Authentication=1;AuthMutationCancellationPort=2;authorization=1;AuthTerminalError=2;credential=8;CredentialBoundaryError=5;NodeOpenAIDeviceAuth=2;OllamaCredentialMutationAction=2;OllamaCredentialMutationPort=2;OpenAIAuthCredentialOpener=2;OpenAICredentialMutationPort=3;openAIDeviceAuth=3;OpenAIDeviceAuthErrorKind=2;OpenAIDeviceAuthPort=3;openOllamaCredentialMutation=2;openOpenAICredentialMutation=2;readAuthChoice=4;readConcealedCredential=2;runAuthCommand=1;runOllamaAuthentication=2;runOpenAIAuthentication=2;startAuthCancellationMonitor=2",
  "packages/agent-cli/src/auth-terminal.ts": "AuthCancellationMonitor=2;AuthCancellationPort=3;AuthTerminalError=8;AuthTerminalInput=5;readAuthChoice=1;readConcealedCredential=1;startAuthCancellationMonitor=1",
  "packages/agent-cli/src/credential-broker-protocol.ts": "accessToken=6;credential=24;CREDENTIAL_BROKER_LIMITS=14;CredentialBrokerProtocolError=5;CredentialBrokerRequest=3;CredentialBrokerResponse=2;decodeCredentialBrokerResponse=1;decodeOpenAICredential=2;encodeCredentialBrokerRequest=1;encodeOpenAICredential=2;invalidCredential=2;openAICredential=4;OpenAICredential=5;openAITokenBytes=5;refreshToken=6",
  "packages/agent-cli/src/credential-broker.ts": "credential=11;CREDENTIAL_BROKER_DEADLINES=3;CREDENTIAL_BROKER_LIMITS=3;CredentialBoundaryError=27;CredentialBrokerBoundary=9;CredentialBrokerConnection=11;CredentialBrokerRequest=3;CredentialBrokerResponse=5;decodeCredentialBrokerResponse=2;encodeCredentialBrokerRequest=2;invalidCredential=5;OllamaCredentialAdmission=3;OllamaCredentialMutation=2;OllamaCredentialMutationAction=3;OllamaCredentialMutationPort=2;OllamaCredentialMutationResult=5;OllamaCredentialMutationState=5;OllamaCredentialSnapshot=2;openAICredential=2;OpenAICredential=3;OpenAICredentialAdmission=3;OpenAICredentialMutation=2;OpenAICredentialMutationAction=3;OpenAICredentialMutationPort=2;OpenAICredentialMutationResult=5;OpenAICredentialMutationState=5;OpenAICredentialSnapshot=2;openOllamaCredentialMutation=1;openOllamaCredentialSnapshot=1;openOpenAICredentialMutation=1;openOpenAICredentialSnapshot=1",
  "packages/agent-cli/src/launch-command.ts": "auth=4",
  "packages/agent-cli/src/main.ts": "auth=9;AuthCommandError=2;authDiagnostic=2;authenticated=4;authentication=11;closeCredentialAdmission=3;credential=9;credentialClosed=2;credentials=1;credentialSnapshot=6;invalidCredential=1;OllamaCredentialAdmission=2;openOllamaCredentialSnapshot=2;runAuthCommand=2",
  "packages/agent-cli/src/model-providers-view.ts": "authenticated=2",
  "packages/agent-cli/src/node-ollama-cloud-transport.ts": "authorization=1;credential=10;isValidOllamaCloudCredential=2",
  "packages/agent-cli/src/node-ollama-model-catalog.ts": "authenticated=1;authorization=1;credential=5;isValidOllamaCloudCredential=2",
  "packages/agent-cli/src/node-openai-device-auth.ts": "access_token=1;accessToken=4;auth=5;authenticate=4;authentication=1;authorization_code=3;authorizationCode=3;authorizationCodeBytes=2;AuthorizationGrant=4;credential=5;decodeAuthorizationGrant=2;decodeCredential=2;device_auth_id=5;deviceauth=3;id_token=1;idToken=3;NodeOpenAIDeviceAuth=1;oauth=1;OPENAI_AUTH_ORIGIN=1;OPENAI_DEVICE_AUTH_LIMITS=15;OPENAI_TOKEN_PATH=2;OpenAIAuthSession=2;OpenAICredential=6;OpenAIDeviceAuthCancellation=5;OpenAIDeviceAuthError=19;OpenAIDeviceAuthErrorKind=11;OpenAIDeviceAuthPort=2;refresh_token=1;refreshToken=3;token=7;tokenBody=2;tokenBodyBytes=2;tokenBytes=4",
  "packages/agent-cli/src/node-openai-provider-transport.ts": "accessToken=7;authorization=2;credential=17",
  "packages/agent-cli/src/notice-scheduler.ts": "NoticeToken=6;token=19",
  "packages/agent-cli/src/notice.ts": "createNoticeToken=1;noticeToken=2;NoticeToken=2",
  "packages/agent-cli/src/provider-configuration.ts": "credential=2;invalidCredential=2;isValidOllamaCloudCredential=2;isValidProviderCredential=2",
  "packages/agent-cli/src/provider-model-catalog.ts": "authenticated=1;credential=1",
  "packages/agent-cli/src/provider-session.ts": "authentication=8;credential=17;credentialValid=2;invalidCredential=2;isValidOllamaCloudCredential=2",
  "packages/agent-cli/src/run.ts": "noticeToken=1;token=1",
  "packages/agent-cli/src/session-journal.ts": "sessionState=4",
  "packages/agent-cli/src/shell-execution-policy.ts": "credential=1",
  "packages/agent-cli/src/turn-failure-presentation.ts": "authorization=1",
  "packages/agent-cli/src/workspace-mutation-preview.ts": "logicalRowTokens=3",
  "packages/agent-cli/src/workspace-namespace-preview.ts": "authorized=1",
  "packages/agent-cli/src/workspace-read-policy.ts": "credentials=1",
  "packages/agent-cli/test/application.test.ts": "auth=4;authenticated=12;authentication=5;authorizing=1;credential=3;noticeToken=8",
  "packages/agent-cli/test/auth-command.test.ts": "accessToken=1;auth=6;AuthCancellationMonitor=2;AuthCancellationPort=2;AuthCommandDependencies=2;AuthCredentialOpener=2;authenticate=2;credential=4;FakeDeviceAuth=4;OllamaCredentialMutationAction=3;OllamaCredentialMutationPort=2;OllamaCredentialMutationResult=2;OpenAICredential=2;OpenAICredentialMutationAction=3;OpenAICredentialMutationPort=2;OpenAICredentialMutationResult=2;openAIDeviceAuth=1;OpenAIDeviceAuthCancellation=2;OpenAIDeviceAuthPort=3;refreshToken=1;runAuthCommand=9;SYNTHETIC_OPENAI_CREDENTIAL=3",
  "packages/agent-cli/test/auth-terminal.test.ts": "auth=2;readAuthChoice=2;readConcealedCredential=3;startAuthCancellationMonitor=5",
  "packages/agent-cli/test/builtin-tools.test.ts": "authorized=1;credential=2;secret=16;token=3",
  "packages/agent-cli/test/chat-view.test.ts": "auth=2;authenticated=1;authentication=2;authorized=1;credential=2;unauthenticated=1",
  "packages/agent-cli/test/credential-broker-protocol.test.ts": "accessToken=8;credential=23;CREDENTIAL_BROKER_LIMITS=6;decodeCredentialBrokerResponse=6;encodeCredentialBrokerRequest=12;invalidCredential=1;openAICredential=3;openAITokenBytes=2;refreshToken=8",
  "packages/agent-cli/test/credential-broker.test.ts": "accessToken=2;credential=6;CREDENTIAL_BROKER_DEADLINES=2;CredentialBrokerBoundary=2;openOllamaCredentialMutation=2;openOllamaCredentialSnapshot=5;openOpenAICredentialMutation=2;openOpenAICredentialSnapshot=2;refreshToken=2",
  "packages/agent-cli/test/event-arbiter.test.ts": "createNoticeToken=2;token=2",
  "packages/agent-cli/test/launch-command.test.ts": "auth=4;secret=1",
  "packages/agent-cli/test/node-ollama-cloud-transport.test.ts": "authorization=1;credentials=1",
  "packages/agent-cli/test/node-ollama-model-catalog.test.ts": "authenticated=1;authorization=1;credentials=1",
  "packages/agent-cli/test/node-openai-device-auth.test.ts": "access_token=5;auth=11;authenticate=19;authorization=4;authorization_code=3;device_auth_id=7;Fauth=1;Fdeviceauth=1;id_token=5;NodeOpenAIDeviceAuth=20;OPENAI_DEVICE_AUTH_LIMITS=5;OPENAI_TOKEN_PATH=2;OpenAIDeviceAuthCancellation=2;refresh_token=5;token=3",
  "packages/agent-cli/test/node-openai-provider-transport.test.ts": "accessToken=4;authenticated=1;authorization=3;credential=4;refreshToken=1;token=6",
  "packages/agent-cli/test/notice-scheduler.test.ts": "createNoticeToken=6;token=10",
  "packages/agent-cli/test/provider-configuration.test.ts": "credential=3;credentials=1;invalidCredential=1;isValidOllamaCloudCredential=2",
  "packages/agent-cli/test/provider-failure-classification.test.ts": "PRIVATE_SECRET=1",
  "packages/agent-cli/test/provider-model-catalog.test.ts": "authenticated=1",
  "packages/agent-cli/test/provider-session.test.ts": "_credential=2;authentication=3;credential=7;token=4",
  "packages/agent-cli/test/runtime-integration.test.ts": "authentication=1;credential=1;NoticeToken=4;token=10;tokens=7",
  "packages/agent-cli/test/shell-execution-policy.test.ts": "credential=1;secret=2",
  "packages/agent-cli/test/terminal-interaction.test.ts": "authentication=2;credential=2;noticeToken=1",
  "packages/agent-cli/test/turn-failure-presentation.test.ts": "authorization=2;PRIVATE_SECRET=2;secret=1",
  "packages/agent-cli/test/workspace-ignore.test.ts": "secret=3;Secret=2;secrets=4",
  "packages/agent-cli/test/workspace-read-policy.test.ts": "credentials=3;secret=6;Secret=1;token=1",
  "packages/agent-core/test/structured-value.test.ts": "secret=1",
  "packages/agent-provider-ollama-cloud/test/model.test.ts": "PRIVATE_SECRET=8;secret=1",
  "packages/agent-runtime/test/runtime.test.ts": "secret=2",
  "packages/agent-tools/src/engine.ts": "token=4;TOOL_EFFECT_PLAN_TOKEN=3;TOOL_HANDLER_OUTCOME_TOKEN=4",
  "packages/agent-tools/test/schema.test.ts": "secret=1",
  "packages/agent-tui/test/rich-row.test.ts": "credentials=2;secret=1",
  "packages/agent-tui/test/split-line.test.ts": "secret=2",
  "types/node-runtime/index.d.ts": "authorization=1",
});

const REVIEWED_SENSITIVE_STATE_IDENTIFIERS = Object.freeze([
  ...new Set(
    Object.values(EXPECTED_SENSITIVE_STATE_OCCURRENCES).flatMap((inventory) =>
      inventory.split(";").map((entry) =>
        entry.slice(0, entry.lastIndexOf("=")),
      ),
    ),
  ),
]);

const APPROVED_CLI_NODE_EFFECT_AUTHORITIES = Object.freeze({
  "packages/agent-cli/src/builtin-tools.ts": Object.freeze({
    imports: Object.freeze(["type Dirent", "lstat", "opendir", "readFile"]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/credential-broker.ts": Object.freeze({
    imports: Object.freeze(["spawn", "type ChildProcess", "type SpawnOptions"]),
    module: "node:child_process",
  }),
  "packages/agent-cli/src/session-journal.ts": Object.freeze({
    imports: Object.freeze([
      "lstat",
      "mkdir",
      "open",
      "readFile",
      "readdir",
      "rename",
      "rm",
    ]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/workspace-boundary.ts": Object.freeze({
    imports: Object.freeze(["lstat", "realpath"]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/workspace-mutation-plans.ts": Object.freeze({
    imports: Object.freeze(["lstat", "open"]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/workspace-namespace-plans.ts": Object.freeze({
    imports: Object.freeze(["lstat", "opendir"]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/workspace-path.ts": Object.freeze({
    imports: Object.freeze(["lstat", "realpath"]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/workspace-read-policy.ts": Object.freeze({
    imports: Object.freeze(["lstat", "readFile", "realpath"]),
    module: "node:fs/promises",
  }),
  "packages/agent-cli/src/node-process-runner.ts": Object.freeze({
    imports: Object.freeze(["spawn", "type ChildProcess"]),
    module: "node:child_process",
  }),
  "packages/agent-cli/src/platform-clipboard.ts": Object.freeze({
    imports: Object.freeze(["spawn", "type ChildProcess", "type SpawnOptions"]),
    module: "node:child_process",
  }),
  "packages/agent-cli/src/platform-workspace-mutation.ts": Object.freeze({
    imports: Object.freeze(["spawn", "type ChildProcess", "type SpawnOptions"]),
    module: "node:child_process",
  }),
  "packages/agent-cli/src/platform-workspace-namespace.ts": Object.freeze({
    imports: Object.freeze(["spawn", "type ChildProcess", "type SpawnOptions"]),
    module: "node:child_process",
  }),
  "packages/agent-cli/src/platform-workspace-roots.ts": Object.freeze({
    imports: Object.freeze([
      "spawn",
      "type ReadOnlyChildProcess",
      "type SpawnReadOptions",
    ]),
    module: "node:child_process",
  }),
  "packages/agent-cli/src/node-ollama-cloud-transport.ts": Object.freeze({
    imports: Object.freeze([
      "request as nodeHttpsRequest",
      "type ClientRequest",
      "type IncomingMessage",
      "type RequestOptions",
    ]),
    module: "node:https",
  }),
  "packages/agent-cli/src/node-ollama-model-catalog.ts": Object.freeze({
    imports: Object.freeze([
      "request as nodeHttpsRequest",
      "type ClientRequest",
      "type IncomingMessage",
      "type RequestOptions",
    ]),
    module: "node:https",
  }),
  "packages/agent-cli/src/node-openai-device-auth.ts": Object.freeze({
    imports: Object.freeze([
      "request as nodeHttpsRequest",
      "type ClientRequest",
      "type IncomingMessage",
      "type RequestOptions",
    ]),
    module: "node:https",
  }),
  "packages/agent-cli/src/node-openai-provider-transport.ts": Object.freeze({
    imports: Object.freeze([
      "request as nodeHttpsRequest",
      "type ClientRequest",
      "type IncomingMessage",
      "type RequestOptions",
    ]),
    module: "node:https",
  }),
});

const APPROVED_CLI_PRODUCT_TREE = Object.freeze({
  pathCount: 77,
  pathsSha256:
    "77c8397dbd7beeb160780c808fcbabdc6776af2c12f17a1e3ad40685040975b1",
  sourceSha256:
    "070f7b8ab3b82e43e0d7784bd59068863ab8b9f815c4ce9409756f9e68a2047d",
});

const APPROVED_CLI_NATIVE_PLATFORM_TREE = Object.freeze({
  paths: Object.freeze([
    "packages/agent-cli/native/clipboard/backend-fixture.c",
    "packages/agent-cli/native/clipboard/backend-windows.c",
    "packages/agent-cli/native/clipboard/clipboard.h",
    "packages/agent-cli/native/clipboard/main.c",
    "packages/agent-cli/native/clipboard/protocol.c",
    "packages/agent-cli/native/clipboard/protocol.h",
    "packages/agent-cli/native/credential-broker/credential-store.c",
    "packages/agent-cli/native/credential-broker/credential-store.h",
    "packages/agent-cli/native/credential-broker/lineage-windows.c",
    "packages/agent-cli/native/credential-broker/lineage-windows.h",
    "packages/agent-cli/native/credential-broker/main.c",
    "packages/agent-cli/native/mutation-commit/backend-linux.c",
    "packages/agent-cli/native/mutation-commit/backend-windows.c",
    "packages/agent-cli/native/mutation-commit/main.c",
    "packages/agent-cli/native/mutation-commit/mutation-commit.h",
    "packages/agent-cli/native/mutation-commit/protocol.c",
    "packages/agent-cli/native/namespace-commit/backend-linux.c",
    "packages/agent-cli/native/namespace-commit/backend-windows.c",
    "packages/agent-cli/native/namespace-commit/main.c",
    "packages/agent-cli/native/namespace-commit/namespace-commit.h",
    "packages/agent-cli/native/namespace-commit/protocol.c",
    "packages/agent-cli/native/process-broker/backend-linux.c",
    "packages/agent-cli/native/process-broker/backend-windows.c",
    "packages/agent-cli/native/process-broker/broker.h",
    "packages/agent-cli/native/process-broker/main.c",
    "packages/agent-cli/native/process-broker/protocol.c",
    "packages/agent-cli/native/process-broker/test-fixture.c",
    "packages/agent-cli/native/workspace-roots/backend-linux.c",
    "packages/agent-cli/native/workspace-roots/backend-windows.c",
    "packages/agent-cli/native/workspace-roots/main.c",
    "packages/agent-cli/native/workspace-roots/workspace-roots.h",
  ]),
  sourceSha256: "1ac76cc3d7ee3117285b56fed21314021e84f9dd98e820a23117c1833fa9386f",
});

const FORBIDDEN_SOURCE_MARKERS = [
  [/(?:auth\.openai\.com|chatgpt\.com\/backend-api)/iu, "OpenAI subscription endpoint"],
  [/(?:claude\.ai\/oauth|platform\.claude\.com\/v1\/oauth)/iu, "Claude subscription endpoint"],
  [/(?:auth\.kimi\.com|api\.kimi\.com\/coding)/iu, "Kimi subscription endpoint"],
  [/(?:auth\.x\.ai|api\.x\.ai\/v1)/iu, "xAI subscription endpoint"],
  [/(?:opencode\.ai\/zen|AGENT_OPENCODE_(?:GO|ZEN)_API_KEY)/u, "retired OpenCode provider boundary"],
  [/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\b/u, "ambient network capability"],
  [/\b(?:oauth|pkce|CLIENT_ID|clientId|client_id)\b/iu, "OAuth client protocol"],
  [/\b(?:accessToken|access_token|refreshToken|refresh_token|deviceCode|device_code)\b/iu, "OAuth credential protocol"],
  [/\b(?:openai|chatgpt|anthropic|claude|kimi|deepseek|xai|grok)\b/iu, "provider implementation outside its reviewed source"],
  [/\b(?:applicationId|bearer(?:Token|Value)?)\b/iu, "OAuth identity or credential protocol"],
  [/\b(?:ANTHROPIC_OAUTH_TOKEN|KIMI_CODE_OAUTH_HOST)\b/u, "provider token configuration"],
  [/(?:auth\.json|\.codex|\.claude|\.kimi-code|\.grok)/u, "foreign credential storage"],
  [/(?:originator[^\n]*pi|referrer[^\n]*pi|You are Claude Code|claude-cli\/)/iu, "foreign product identity"],
];

const FORBIDDEN_COMPACT_MARKERS = [
  [/auth\.openai\.com/u, "OpenAI subscription endpoint"],
  [/chatgpt\.com\/backendapi/u, "OpenAI subscription endpoint"],
  [/claude\.ai\/oauth/u, "Claude subscription endpoint"],
  [/platform\.claude\.com\/v1\/oauth/u, "Claude subscription endpoint"],
  [/auth\.kimi\.com/u, "Kimi subscription endpoint"],
  [/api\.kimi\.com\/coding/u, "Kimi subscription endpoint"],
  [/auth\.x\.ai/u, "xAI subscription endpoint"],
  [/api\.x\.ai\/v1/u, "xAI subscription endpoint"],
  [/[=:](?:access|refresh)token(?:[;,}]|$)/u, "OAuth access or refresh token"],
  [/[=:]devicecode(?:[;,}]|$)/u, "OAuth device code"],
  [/\.codex\/auth\.json/u, "foreign credential storage"],
  [/\.claude/u, "foreign credential storage"],
  [/\.kimicode/u, "foreign credential storage"],
  [/\.grok/u, "foreign credential storage"],
  [/(?:identity|originator|referrer)[=:]pi(?:\/|[;,}])/u, "foreign product identity"],
  [/youareclaudecode/u, "foreign product identity"],
];

export class ProviderPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderPolicyError";
  }
}

function fail(message) {
  throw new ProviderPolicyError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isRecord(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(label + " keys mismatch");
  }
}

function assertSame(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + " mismatch");
  }
}

function validateRequestLifecycle(request, label) {
  if (request.state === "ready-not-submitted") {
    if (request.submittedOn !== null || request.reference !== null) {
      fail(label + " unsubmitted request must not retain submission metadata");
    }
    return;
  }
  if (
    request.state !== "submitted" ||
    typeof request.submittedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(request.submittedOn) ||
    typeof request.reference !== "string" ||
    request.reference.length === 0
  ) {
    fail(label + " submitted request metadata is invalid");
  }
  if (
    request.visibility === "public" &&
    !/^https:\/\/[A-Za-z0-9.-]+(?:\/|$)/u.test(request.reference)
  ) {
    fail(label + " public submission reference must be an HTTPS URL");
  }
  if (
    request.visibility === "private" &&
    (!/^[A-Za-z0-9._:-]{1,128}$/u.test(request.reference) ||
      request.reference.includes("@"))
  ) {
    fail(label + " private submission reference must be content-free text");
  }
}

function validateResponseLifecycle(response, label) {
  if (response === null) {
    return;
  }
  assertExactKeys(
    response,
    ["state", "receivedOn", "outcome", "reference"],
    label,
  );
  if (
    response.state !== "received" ||
    typeof response.receivedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(response.receivedOn) ||
    response.outcome !== "public-oauth-unavailable" ||
    typeof response.reference !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/u.test(response.reference) ||
    response.reference.includes("@")
  ) {
    fail(label + " metadata is invalid");
  }
}

function markdownHeadings(text, level) {
  const prefix = "#".repeat(level) + " ";
  return text
    .split("\n")
    .filter((line) => line.startsWith(prefix) && !line.startsWith(prefix + "#"))
    .map((line) => line.slice(prefix.length));
}

function markdownSection(text, heading, nextHeading) {
  const startToken = "## " + heading + "\n";
  const start = text.indexOf(startToken);
  if (start < 0 || text.indexOf(startToken, start + startToken.length) >= 0) {
    fail("provider application section is missing or duplicated: " + heading);
  }
  const bodyStart = start + startToken.length;
  const end = nextHeading === undefined
    ? text.length
    : text.indexOf("## " + nextHeading + "\n", bodyStart);
  if (end < 0) {
    fail("provider application section order is invalid: " + heading);
  }
  return text.slice(bodyStart, end);
}

function markdownSubsection(text, heading, nextHeading) {
  const startToken = "### " + heading + "\n";
  const start = text.indexOf(startToken);
  if (start < 0 || text.indexOf(startToken, start + startToken.length) >= 0) {
    fail("provider application subsection is missing or duplicated: " + heading);
  }
  const bodyStart = start + startToken.length;
  const end = nextHeading === undefined
    ? text.length
    : text.indexOf("### " + nextHeading + "\n", bodyStart);
  if (end < 0) {
    fail("provider application subsection order is invalid: " + heading);
  }
  return text.slice(bodyStart, end);
}

function requestBody(section, provider) {
  const startToken = "### Request\n\n```text\n";
  const start = section.indexOf(startToken);
  const end = start < 0 ? -1 : section.indexOf("\n```", start + startToken.length);
  if (start < 0 || end < 0) {
    fail("provider request is not a copyable text block: " + provider.id);
  }
  const body = section.slice(start + startToken.length, end);
  if (
    body.length < 500 ||
    !body.includes("giovannijecha/agent") ||
    !body.includes("Giovanni Jecha") ||
    /\b(?:TODO|TBD|CHANGEME)\b/iu.test(body)
  ) {
    fail("provider request body is incomplete: " + provider.id);
  }
  return body;
}

function validateApplicationDocument(policy, text) {
  if (
    policy.applicationDocument !== APPLICATION_DOCUMENT ||
    policy.researchedOn !== RESEARCH_DATE ||
    !text.startsWith("# Provider registration requests\n") ||
    !text.includes("- Research date: `" + RESEARCH_DATE + "`")
  ) {
    fail("provider application identity or research date mismatch");
  }
  assertSame(markdownHeadings(text, 2), APPLICATION_HEADINGS, "provider application headings");

  for (let index = 0; index < EXPECTED_PROVIDERS.length; index += 1) {
    const provider = EXPECTED_PROVIDERS[index];
    const nextHeading = APPLICATION_HEADINGS[index + 2];
    const section = markdownSection(text, provider.displayName, nextHeading);
    assertSame(
      markdownHeadings(section, 3),
      REQUEST_HEADINGS,
      provider.id + " request headings",
    );
    for (const marker of [
      "- Eligibility: `" + provider.eligibility + "`",
      "- Request state: `" + provider.request.state + "`",
      "- Request kind: `" + provider.request.kind + "`",
      "- Submission route: `" + provider.request.route + "`",
      "- Channel visibility: `" + provider.request.visibility + "`",
    ]) {
      if (!section.includes(marker)) {
        fail(provider.id + " request metadata mismatch");
      }
    }
    if (provider.request.state === "submitted") {
      const referenceMarker = provider.request.visibility === "public"
        ? "- Public reference: [Submission record](" + provider.request.reference + ")"
        : "- Private reference: `" + provider.request.reference + "`";
      for (const marker of [
        "- Submitted on: `" + provider.request.submittedOn + "`",
        referenceMarker,
      ]) {
        if (!section.includes(marker)) {
          fail(provider.id + " submitted request metadata mismatch");
        }
      }
    } else if (
      section.includes("- Submitted on:") ||
      section.includes("- Public reference:") ||
      section.includes("- Private reference:")
    ) {
      fail(provider.id + " unsubmitted request contains submission metadata");
    }
    if (provider.request.response !== null) {
      for (const marker of [
        "- Response state: `" + provider.request.response.state + "`",
        "- Response received on: `" + provider.request.response.receivedOn + "`",
        "- Response outcome: `" + provider.request.response.outcome + "`",
        "- Private response reference: `" + provider.request.response.reference + "`",
      ]) {
        if (!section.includes(marker)) {
          fail(provider.id + " response metadata mismatch");
        }
      }
    } else if (
      section.includes("- Response state:") ||
      section.includes("- Response received on:") ||
      section.includes("- Response outcome:") ||
      section.includes("- Private response reference:")
    ) {
      fail(provider.id + " request contains unregistered response metadata");
    }
    requestBody(section, provider);
    const route = markdownSubsection(section, "Official route", "Subject");
    if (!route.includes(OFFICIAL_ROUTE_MARKERS[provider.id])) {
      fail(provider.id + " request official route is incomplete");
    }
    const attachments = markdownSubsection(
      section,
      "Public attachments",
      "Required written answer",
    );
    for (const url of PUBLIC_ATTACHMENT_URLS) {
      if (!attachments.includes("](" + url + ")")) {
        fail(provider.id + " request public attachments are incomplete");
      }
    }
    const evidence = markdownSubsection(section, "Official evidence", undefined);
    for (const url of OFFICIAL_EVIDENCE_URLS[provider.id]) {
      if (!evidence.includes(url)) {
        fail(provider.id + " request official evidence is incomplete");
      }
    }
  }

  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
  for (const email of emails) {
    if (!ALLOWED_APPLICATION_EMAILS.has(email.toLowerCase())) {
      fail("provider applications contain an unapproved email address");
    }
  }
}

function validateRegistry(policy) {
  assertExactKeys(
    policy,
    [
      "schemaVersion",
      "applicationDocument",
      "researchedOn",
      "subscriptionCompatibility",
      "providers",
      "directProviders",
      "subscriptionContracts",
    ],
    "provider policy",
  );
  if (policy.schemaVersion !== PROVIDER_POLICY_SCHEMA_VERSION) {
    fail("unsupported provider policy schema");
  }
  assertExactKeys(
    policy.subscriptionCompatibility,
    [
      "decision",
      "state",
      "providers",
      "registrationAuthority",
      "callerIdentity",
      "disclosure",
      "foreignCredentialImport",
      "foreignRuntime",
      "implementation",
      "researchedOn",
    ],
    "subscription compatibility policy",
  );
  if (
    JSON.stringify(policy.subscriptionCompatibility) !==
    JSON.stringify(EXPECTED_SUBSCRIPTION_COMPATIBILITY)
  ) {
    fail("subscription compatibility policy mismatch");
  }
  if (!Array.isArray(policy.providers)) {
    fail("provider policy providers must be an array");
  }
  if (policy.providers.length !== EXPECTED_PROVIDERS.length) {
    fail("provider policy must contain exactly four providers");
  }

  const seen = new Set();
  for (let index = 0; index < policy.providers.length; index += 1) {
    const provider = policy.providers[index];
    const expected = EXPECTED_PROVIDERS[index];
    assertExactKeys(
      provider,
      ["id", "displayName", "eligibility", "blocker", "request"],
      "provider at index " + String(index),
    );
    assertExactKeys(
      provider.request,
      [
        "state",
        "kind",
        "route",
        "visibility",
        "submittedOn",
        "reference",
        "response",
      ],
      "provider request at index " + String(index),
    );
    validateRequestLifecycle(provider.request, "provider request at index " + String(index));
    validateResponseLifecycle(
      provider.request.response,
      "provider response at index " + String(index),
    );
    if (seen.has(provider.id)) {
      fail("duplicate provider id: " + String(provider.id));
    }
    seen.add(provider.id);
    if (JSON.stringify(provider) !== JSON.stringify(expected)) {
      fail("provider policy mismatch at index " + String(index));
    }
  }

  if (
    !Array.isArray(policy.directProviders) ||
    policy.directProviders.length !== EXPECTED_DIRECT_PROVIDERS.length
  ) {
    fail("provider policy must contain exactly one admitted direct provider");
  }
  for (let index = 0; index < policy.directProviders.length; index += 1) {
    const provider = policy.directProviders[index];
    assertExactKeys(
      provider,
      [
        "id",
        "displayName",
        "eligibility",
        "authorization",
        "credentialVariable",
        "credentialCommand",
        "credentialRecord",
        "credentialAdmission",
        "credentialPersistence",
        "chatEndpoint",
        "catalogEndpoint",
        "catalogAuthentication",
        "modelAuthority",
        "modelCost",
        "transport",
        "evidence",
        "researchedOn",
      ],
      "direct provider at index " + String(index),
    );
    if (
      JSON.stringify(provider) !==
      JSON.stringify(EXPECTED_DIRECT_PROVIDERS[index])
    ) {
      fail("direct provider policy mismatch at index " + String(index));
    }
  }

  if (
    !Array.isArray(policy.subscriptionContracts) ||
    policy.subscriptionContracts.length !== EXPECTED_SUBSCRIPTION_CONTRACTS.length
  ) {
    fail("provider policy must contain exactly one subscription contract");
  }
  for (let index = 0; index < policy.subscriptionContracts.length; index += 1) {
    const contract = policy.subscriptionContracts[index];
    assertExactKeys(
      contract,
      [
        "id",
        "decision",
        "identityDecision",
        "credentialDecision",
        "authDecision",
        "transportDecision",
        "state",
        "flow",
        "issuer",
        "deviceCodeEndpoint",
        "devicePollingEndpoint",
        "deviceVerificationEndpoint",
        "tokenEndpoint",
        "revocationEndpoint",
        "catalogEndpoint",
        "chatEndpoint",
        "clientId",
        "clientType",
        "clientIdentityAuthority",
        "callerIdentity",
        "authOriginator",
        "authUserAgent",
        "deviceRequestFields",
        "requestedScopes",
        "deviceRedirect",
        "devicePollPendingStatuses",
        "devicePollSuccess",
        "devicePollTerminal",
        "tokenEndpointAuthMethod",
        "pkceMethod",
        "disclosure",
        "clientRegistrationEndpoint",
        "credentialRecord",
        "credentialRecoveryRecords",
        "credentialEnvironment",
        "credentialAdmission",
        "credentialCommand",
        "authCapability",
        "providerRuntime",
        "refreshRuntime",
        "revocationRuntime",
        "deviceResponseFields",
        "deviceOptionalResponseFields",
        "deviceExpirationBytes",
        "deviceIntervalEncoding",
        "deviceIntervalSeconds",
        "pollRequestFields",
        "pollResponseFields",
        "pollOptionalResponseFields",
        "pollAdditionalResponseMembers",
        "tokenRequestFields",
        "tokenResponseFields",
        "accountClaimNamespace",
        "accountClaim",
        "expirationClaim",
        "authenticationDeadlineMilliseconds",
        "challengePresentation",
        "firstPoll",
        "credentialRemoval",
        "credentialProtocol",
        "transportWorkspace",
        "transportComposition",
        "catalogRequest",
        "catalogResponse",
        "responsesRequest",
        "responsesStream",
        "modelAuthority",
        "transport",
        "evidence",
        "identityEvidence",
        "researchedOn",
      ],
      "subscription contract at index " + String(index),
    );
    if (
      JSON.stringify(contract) !==
      JSON.stringify(EXPECTED_SUBSCRIPTION_CONTRACTS[index])
    ) {
      fail("subscription contract mismatch at index " + String(index));
    }
    const provider = policy.providers.find((candidate) => candidate.id === contract.id);
    if (
      provider?.eligibility !== "blocked" ||
      provider.blocker !== "runtime-integration-required"
    ) {
      fail("subscription contract must retain its inactive implementation gate");
    }
  }
}

function validateWorkspaces(workspaceNames) {
  const actual = [...workspaceNames].sort();
  const expected = [...EXPECTED_WORKSPACES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("provider policy requires the exact admitted workspaces");
  }
}

function decodeScannableEscapes(text) {
  return text
    .replace(/\\x([0-9A-Fa-f]{2})/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/\\u\{([0-9A-Fa-f]{1,6})\}/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/\\u([0-9A-Fa-f]{4})/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    );
}

function compactSource(text) {
  return decodeScannableEscapes(text)
    .replace(/[\s\x22'`+\\_-]/gu, "")
    .toLowerCase();
}

function isSensitiveStateIdentifier(identifier) {
  const normalized = identifier.toLowerCase();
  if (
    normalized.includes("credential") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    (normalized.includes("auth") && !normalized.includes("authorit"))
  ) {
    return true;
  }
  return normalized.includes("session") && [
    "auth",
    "credential",
    "reader",
    "secret",
    "state",
    "store",
    "token",
  ].some((marker) => normalized.includes(marker));
}

function validateSensitiveStateIdentifiers(path, text) {
  const decoded = decodeScannableEscapes(text);
  const occurrences = new Map();
  for (const match of decoded.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/gu)) {
    const identifier = match.at(0);
    if (
      identifier !== undefined &&
      isSensitiveStateIdentifier(identifier) &&
      !REVIEWED_SENSITIVE_STATE_IDENTIFIERS.includes(identifier)
    ) {
      fail(path + " contains unregistered sensitive-state identifier");
    }
    if (identifier !== undefined && isSensitiveStateIdentifier(identifier)) {
      occurrences.set(identifier, (occurrences.get(identifier) ?? 0) + 1);
    }
  }
  const actual = [...occurrences]
    .sort((left, right) => left.at(0).localeCompare(right.at(0)))
    .map((entry) => entry.at(0) + "=" + String(entry.at(1)))
    .join(";");
  const expected = EXPECTED_SENSITIVE_STATE_OCCURRENCES[path] ?? "";
  if (actual !== expected) {
    fail(path + " contains sensitive-state identifier occurrence drift");
  }
}

function validateCliNodeEffectAuthority(path, text) {
  if (!path.startsWith("packages/agent-cli/src/")) {
    return;
  }
  const decoded = decodeScannableEscapes(text);
  const references = [
    ...decoded.matchAll(
      /["']node:(?:child_process|fs(?:\/promises)?|https)["']/gu,
    ),
  ];
  const expected = APPROVED_CLI_NODE_EFFECT_AUTHORITIES[path];
  if (expected === undefined && references.length === 0) {
    return;
  }
  if (expected === undefined) {
    fail(path + " contains unregistered CLI Node effect authority");
  }
  const imports = [
    ...decoded.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*["'](node:(?:child_process|fs(?:\/promises)?|https))["']\s*;/gu,
    ),
  ];
  if (imports.length !== 1 || references.length !== 1) {
    fail(path + " contains CLI Node effect authority drift");
  }
  const source = imports.at(0)?.at(1);
  const module = imports.at(0)?.at(2);
  const actual = source?.split(",").map((entry) => entry.trim()).filter(
    (entry) => entry.length > 0,
  );
  if (
    module !== expected.module ||
    actual === undefined ||
    JSON.stringify(actual) !== JSON.stringify(expected.imports)
  ) {
    fail(path + " contains CLI Node effect authority drift");
  }
}

function validateExactSourceTree(productSources, expected, select, label) {
  const sources = productSources
    .filter(select)
    .sort((left, right) => left.path.localeCompare(right.path));
  const paths = sources.map((source) => source.path);
  const expectedPathCount = expected.paths?.length ?? expected.pathCount;
  const expectedPathsSha256 = expected.pathsSha256 ??
    createHash("sha256")
      .update(JSON.stringify(expected.paths), "utf8")
      .digest("hex");
  const pathsSha256 = createHash("sha256")
    .update(JSON.stringify(paths), "utf8")
    .digest("hex");
  if (
    paths.length !== expectedPathCount ||
    pathsSha256 !== expectedPathsSha256
  ) {
    fail(label + " path drift");
  }
  const records = sources.map((source) => Object.freeze({
    path: source.path,
    source: source.text.replaceAll("\r\n", "\n"),
  }));
  const sourceSha256 = createHash("sha256")
    .update(JSON.stringify(records), "utf8")
    .digest("hex");
  if (sourceSha256 !== expected.sourceSha256) {
    fail(label + " source-integrity drift");
  }
}

function validateProductSources(productSources) {
  for (const source of productSources) {
    if (
      !isRecord(source) ||
      typeof source.path !== "string" ||
      typeof source.text !== "string"
    ) {
      fail("product source entries must contain path and text");
    }
    let scannable = source.text;
    const approved = APPROVED_SOURCE_LITERALS[source.path] ?? [];
    for (const literal of approved) {
      scannable = scannable.split(literal).join("");
    }
    for (const [pattern, label] of FORBIDDEN_SOURCE_MARKERS) {
      if (pattern.test(scannable)) {
        fail(source.path + " contains forbidden " + label);
      }
    }
    validateSensitiveStateIdentifiers(source.path, source.text);
    validateCliNodeEffectAuthority(source.path, source.text);
    const compact = compactSource(scannable);
    if (
      /import(?!\{)[^;]*fromnode:process/u.test(compact) ||
      /import\{[^}]*defaultas[^}]*\}fromnode:process/u.test(compact)
    ) {
      fail(source.path + " contains a broad node:process import");
    }
    for (const [pattern, label] of FORBIDDEN_COMPACT_MARKERS) {
      if (pattern.test(compact)) {
        fail(source.path + " contains obfuscated " + label);
      }
    }
  }
  validateExactSourceTree(
    productSources,
    APPROVED_CLI_PRODUCT_TREE,
    (source) =>
      /^packages\/agent-cli\/src\/(?:[^/]+\/)*[^/]+\.ts$/u.test(source.path),
    "CLI product tree",
  );
  validateExactSourceTree(
    productSources,
    APPROVED_CLI_NATIVE_PLATFORM_TREE,
    (source) =>
      /^packages\/agent-cli\/native\/.*\.(?:c|h)$/u.test(source.path),
    "CLI native platform authority",
  );
}

export function validateProviderPolicy(policy, context) {
  if (
    !isRecord(context) ||
    !Array.isArray(context.workspaceNames) ||
    !Array.isArray(context.productSources) ||
    typeof context.applicationText !== "string"
  ) {
    fail("provider policy validation context is invalid");
  }
  validateRegistry(policy);
  validateApplicationDocument(policy, context.applicationText);
  validateWorkspaces(context.workspaceNames);
  validateProductSources(context.productSources);
}
