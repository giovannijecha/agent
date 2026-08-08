# Provider registration requests

- Research date: `2026-08-08`
- Maintainer: Giovanni Jecha
- Repository: [github.com/giovannijecha/agent](https://github.com/giovannijecha/agent)
- Overall submission state: no request has been submitted

These are project-authored authorization inquiries, not provider-issued
registration forms and not evidence of approval. They are ready for the
maintainer to copy into the official routes below after one final visual review.
All four integrations remain blocked until the relevant provider gives a
complete written authorization.

## Submission rules

1. Recheck the linked official sources on the day of submission.
2. Submit from the maintainer's own provider account. Enter an account email or
   account identifier only inside the provider-owned private form when required.
3. Do not add account details, correspondence, tokens, or provider-issued
   identifiers to this public file.
4. For a public route, submit only the prepared text and public repository
   links. For a private route, keep the complete reply outside Git.
5. Mark a request as submitted only after the official route confirms receipt.
   Submission does not change provider eligibility.

## ChatGPT Plus/Pro

### Status

- Eligibility: `blocked`
- Request state: `ready-not-submitted`
- Request kind: `public-client-authorization-inquiry`
- Submission route: `openai-developer-forum`
- Channel visibility: `public`

### Official route

Open a new topic in the
[OpenAI Developer Forum](https://community.openai.com/), which OpenAI lists as
its developer community-support route. Ask that the inquiry be routed to the
Codex authentication or developer-relations team. No public form specifically
for independent Codex OAuth-client registration was found. The
[Codex for Open Source application](https://openai.com/form/codex-for-oss/)
offers maintainer support, ChatGPT Pro, Codex Security, and API credits; it is
not a substitute for this registration request.

### Subject

`Independent native OAuth public-client registration request for agent`

### Request

```text
Hello OpenAI Codex team,

I maintain agent, an Apache-2.0 open-source personal coding agent:
https://github.com/giovannijecha/agent

I am requesting written authorization and, if available, an agent-specific
native OAuth public-client registration so users can voluntarily sign in with
ChatGPT and use an eligible Plus or Pro Codex subscription directly from agent.

agent is a local Node.js command-line application with no backend, telemetry,
embedded browser, or password collection. Authentication would remain on an
OpenAI-hosted browser page. The client cannot keep a secret, so the preferred
flow is device authorization; authorization code with PKCE and a loopback
redirect is an acceptable fallback. Provider credentials would initially be
memory-only.

The project will not bundle or invoke Codex CLI, the Codex SDK, or Codex App
Server; reuse another application's client identity; read another product's
credential files; or claim to be an OpenAI client. All protocol code would be
independently implemented from a provider-published contract and identify the
application truthfully as agent.

Please confirm whether this use is authorized and either provide the official
registration process or state that no direct independent-client route is
available. If it is available, please identify the documented authorization,
refresh, revocation, entitlement, model transport, rate-limit, branding, and
open-source distribution requirements. A written refusal is also useful because
the repository fails closed until authorization is complete.

Thank you,
Giovanni Jecha
Maintainer, agent
```

### Public attachments

- [Repository](https://github.com/giovannijecha/agent)
- [OAuth posture](https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md)
- [Privacy policy](https://github.com/giovannijecha/agent/blob/main/PRIVACY.md)
- [Security policy](https://github.com/giovannijecha/agent/blob/main/SECURITY.md)

### Required written answer

- Whether an independently implemented native client may use eligible
  ChatGPT Plus/Pro Codex subscription capacity.
- Whether OpenAI will issue `agent` a public-client registration or publish an
  identity explicitly reusable by independent clients.
- The stable authorization, token lifecycle, revocation, entitlement, model
  transport, rate-limit, and error contracts.
- Required application identification, branding, review, distribution, and
  incident-response obligations.

### Do not include

Do not publish a ChatGPT account email, organization or account identifier,
session export, cookie, token, browser callback, screenshot of an authenticated
page, or any identifier observed in Codex source or traffic.

### Official evidence

- [Codex authentication](https://developers.openai.com/codex/auth/)
- [Codex App Server authentication surface](https://developers.openai.com/codex/app-server/)
- [OpenAI developer community routes](https://developers.openai.com/community)
- [Codex for Open Source scope](https://developers.openai.com/community/codex-for-oss)

## Claude Pro/Max

### Status

- Eligibility: `blocked`
- Request state: `ready-not-submitted`
- Request kind: `public-client-authorization-inquiry`
- Submission route: `anthropic-support-messenger`
- Channel visibility: `private`

### Official route

Sign in to Claude, choose **Get help**, and use the official support messenger.
Anthropic's [support instructions](https://support.claude.com/en/articles/9015913-how-to-get-support)
document Product Support access for Pro and Max subscribers through that route.
Ask the support agent to escalate the inquiry to the Claude Code or Agent SDK
authentication team. No public independent-client registration form was found.

### Subject

`Independent native OAuth public-client authorization request for agent`

### Request

```text
Hello Anthropic Product Support,

I maintain agent, an Apache-2.0 open-source personal coding agent:
https://github.com/giovannijecha/agent

I am requesting written authorization and, if supported, an agent-specific
native OAuth public-client registration so users can voluntarily sign in with
Claude and use an eligible Pro or Max subscription directly from agent.

agent is a local Node.js command-line application with no backend, telemetry,
embedded browser, or password collection. Authentication would remain on an
Anthropic-hosted browser page. The client cannot keep a secret, so the preferred
flow is device authorization; authorization code with PKCE and a loopback
redirect is an acceptable fallback. Provider credentials would initially be
memory-only.

I understand that Anthropic currently documents subscription authentication for
Claude Code and subscription-backed third-party use through the Claude Agent SDK.
This project cannot bundle or invoke Claude Code or the Agent SDK, reuse their
client identity, consume their credential store, or identify itself as Claude
Code. It would independently implement only a provider-published protocol and
identify itself truthfully as agent.

Please confirm whether that direct independent-client use is authorized and
provide the registration path or an expressly reusable public identity. If it
is not authorized outside Claude Code or the Agent SDK, please confirm that in
writing. If it is available, please identify the documented authorization,
refresh, revocation, subscription entitlement, model transport, rate-limit,
branding, and open-source distribution requirements.

Thank you,
Giovanni Jecha
Maintainer, agent
```

### Public attachments

- [Repository](https://github.com/giovannijecha/agent)
- [OAuth posture](https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md)
- [Privacy policy](https://github.com/giovannijecha/agent/blob/main/PRIVACY.md)
- [Security policy](https://github.com/giovannijecha/agent/blob/main/SECURITY.md)

### Required written answer

- Whether an independently implemented native client may consume Claude
  Pro/Max subscription capacity without Claude Code or the Agent SDK runtime.
- Whether Anthropic will issue `agent` a public-client registration or publish
  an identity explicitly reusable by independent clients.
- The stable authorization, token lifecycle, revocation, subscription
  entitlement, model transport, rate-limit, and error contracts.
- Required application identity, SDK/runtime obligations, review,
  distribution, and incident-response terms.

### Do not include

Do not provide a Claude account email, organization identifier, long-lived
token, session, browser callback, credential-file content, or any identifier
observed in Claude Code, Agent SDK, or third-party source.

### Official evidence

- [Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Claude Agent SDK use with Claude plans](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Anthropic support route](https://support.claude.com/en/articles/9015913-how-to-get-support)
- [Claude Platform authentication](https://platform.claude.com/docs/en/manage-claude/authentication)

## Kimi Code

### Status

- Eligibility: `blocked`
- Request state: `ready-not-submitted`
- Request kind: `public-client-authorization-inquiry`
- Submission route: `kimi-code-github-issues`
- Channel visibility: `public`

### Official route

Open a feature request in the official
[MoonshotAI Kimi Code issue tracker](https://github.com/MoonshotAI/kimi-code/issues),
which Kimi lists as a supported feedback channel. The Kimi Code CLI `/feedback`
route is an official alternative; if used, choose text only and do not attach
logs or the codebase. No public registration form for independent Kimi Code
OAuth clients was found.

### Subject

`Request: OAuth public-client registration for independent agent clients`

### Request

```text
Hello Kimi Code team,

I maintain agent, an Apache-2.0 open-source personal coding agent:
https://github.com/giovannijecha/agent

I am requesting written authorization and an agent-specific OAuth public-client
registration so Kimi members can voluntarily use Kimi Code subscription benefits
through agent without manually creating an API key.

agent is a local Node.js command-line application with no backend, telemetry,
embedded browser, or password collection. The preferred authentication method
is RFC 8628 device authorization. Provider credentials would initially be held
in process memory only.

I understand that Kimi documents OAuth for Kimi Code CLI and subscription-backed
API keys for third-party development tools. agent will preserve its real client
identity. It will not identify as Kimi Code CLI or another tool, reuse a foreign
client registration, read Kimi Code credentials, invoke the CLI or ACP adapter,
or alter identity headers to obtain membership benefits.

Please confirm whether direct OAuth from an independent open-source native client
is authorized and provide the public-client registration process or an identity
explicitly reusable by independent clients. If supported, please identify the
documented device authorization, refresh, revocation, membership entitlement,
model transport, rate-limit, client-identification, and distribution contracts.
If only the subscriber API-key route is authorized for third-party clients,
please confirm that direct OAuth is unavailable.

Thank you,
Giovanni Jecha
Maintainer, agent
```

### Public attachments

- [Repository](https://github.com/giovannijecha/agent)
- [OAuth posture](https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md)
- [Privacy policy](https://github.com/giovannijecha/agent/blob/main/PRIVACY.md)
- [Security policy](https://github.com/giovannijecha/agent/blob/main/SECURITY.md)

### Required written answer

- Whether an independently implemented native client may use Kimi Code
  membership through direct OAuth rather than a console API key.
- Whether Kimi will issue `agent` a public-client registration or publish an
  identity explicitly reusable by independent clients.
- The stable device authorization, token lifecycle, revocation, membership
  entitlement, model transport, rate-limit, and error contracts.
- Required truthful client identification, review, distribution, and
  incident-response obligations.

### Do not include

Do not publish a Kimi account email or identifier, API key, OAuth credential,
device code, authenticated screenshot, log archive, codebase attachment, or an
identifier observed in Kimi Code source or traffic.

### Official evidence

- [Kimi Code overview and third-party authentication](https://www.kimi.com/code/docs/en/)
- [Kimi Code device authorization](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html)
- [Kimi Code contact and feedback](https://www.kimi.com/code/docs/en/kimi-code/contact-and-feedback.html)
- [Kimi Code community identity rules](https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html)

## Grok subscription

### Status

- Eligibility: `blocked`
- Request state: `ready-not-submitted`
- Request kind: `public-client-authorization-inquiry`
- Submission route: `xai-product-support-email`
- Channel visibility: `private`

### Official route

Email [xAI Product Support](mailto:support@x.ai). xAI publishes that address in
its developer documentation and also links product support from its official
contact page. Use the maintainer's Grok account email only in the private email
metadata if needed. No public independent-client registration form was found.

### Subject

`OAuth public-client registration request for agent and Grok subscriptions`

### Request

```text
Hello xAI Product Support,

I maintain agent, an Apache-2.0 open-source personal coding agent:
https://github.com/giovannijecha/agent

I am requesting written authorization and, if available, an agent-specific
OAuth/OIDC public-client registration so users can voluntarily sign in with xAI
and use eligible Grok subscription or Grok Build capacity directly from agent.

agent is a local Node.js command-line application with no backend, telemetry,
embedded browser, or password collection. The preferred authentication method
is RFC 8628 device authorization; authorization code with PKCE and a loopback
redirect is an acceptable fallback. Provider credentials would initially be
memory-only.

xAI documents browser and device-code login for Grok Build, headless and ACP
integration, and a separate API-key path. agent will not bundle or invoke Grok
Build, use its ACP process, reuse its client identity, read its credential file,
or identify itself as an xAI application. It would independently implement only
a provider-published direct protocol and identify itself truthfully as agent.

Please confirm whether this direct independent-client use is authorized and
provide the public-client registration path or an expressly reusable identity.
If supported, please identify the documented authorization, refresh, revocation,
subscription entitlement, inference transport, rate-limit, branding, review,
and open-source distribution requirements. If Grok Build or separately billed
API keys are the only authorized integration paths, please confirm that no direct
subscription-client registration is available.

Thank you,
Giovanni Jecha
Maintainer, agent
```

### Public attachments

- [Repository](https://github.com/giovannijecha/agent)
- [OAuth posture](https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md)
- [Privacy policy](https://github.com/giovannijecha/agent/blob/main/PRIVACY.md)
- [Security policy](https://github.com/giovannijecha/agent/blob/main/SECURITY.md)

### Required written answer

- Whether an independently implemented native client may use eligible Grok
  subscription or Grok Build capacity directly.
- Whether xAI will issue `agent` a public-client registration or publish an
  identity explicitly reusable by independent clients.
- The stable authorization, token lifecycle, revocation, entitlement, inference
  transport, rate-limit, and error contracts.
- Required application identity, branding, review, distribution, and
  incident-response obligations.

### Do not include

Do not provide a Grok or X account email, xAI team identifier, API key, session,
token, browser callback, credential-file content, or any identifier observed in
Grok Build or third-party source.

### Official evidence

- [Grok Build overview and browser authentication](https://docs.x.ai/build/overview)
- [Grok Build enterprise authentication](https://docs.x.ai/build/enterprise)
- [Grok subscription and product usage](https://docs.x.ai/grok/faq)
- [xAI official contact routes](https://x.ai/contact)
- [xAI developer support address](https://docs.x.ai/developers/debugging)

## Maintenance and removal

For a public submission, store only its public URL and date. For a private
submission, record a content-free reference such as the provider, date, and
case number; keep the message and reply outside the repository. Never mark a
provider approved from silence, a community reply, technical success, or an
undocumented identifier.

Before resubmission, recheck every source, update the research date, and run the
canonical verification command. If this application workflow is removed, also
remove its provider-policy metadata, tests, manual links, provenance entry, and
decision 0011 while leaving all providers blocked.
