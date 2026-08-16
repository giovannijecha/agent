import { err, ok, type Result } from "@agent/core";

export const OPENCODE_GO_API_KEY_VARIABLE = "AGENT_OPENCODE_GO_API_KEY";
export const OPENCODE_ZEN_API_KEY_VARIABLE = "AGENT_OPENCODE_ZEN_API_KEY";

export type OpenCodeGoConfiguration =
  | Readonly<{ kind: "disabled" }>
  | Readonly<{ credential: string; kind: "enabled" }>;
export type OpenCodeGoConfigurationError = Readonly<{
  kind: "invalidCredential";
}>;
export type OpenCodeZenConfiguration =
  | Readonly<{ kind: "disabled" }>
  | Readonly<{ credential: string; kind: "enabled" }>;
export type OpenCodeZenConfigurationError = Readonly<{
  kind: "invalidCredential";
}>;

function isValidProviderCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 8_192 &&
    !/\s|\p{Cc}/u.test(value)
  );
}

export function isValidOpenCodeGoCredential(value: unknown): value is string {
  return isValidProviderCredential(value);
}

export function isValidOpenCodeZenCredential(value: unknown): value is string {
  return isValidProviderCredential(value);
}

/** Validates the optional OpenCode Go credential without normalizing it. */
export function resolveOpenCodeGoConfiguration(
  value: string | undefined,
): Result<OpenCodeGoConfiguration, OpenCodeGoConfigurationError> {
  if (value === undefined) {
    return ok(Object.freeze({ kind: "disabled" as const }));
  }
  if (!isValidOpenCodeGoCredential(value)) {
    return err(Object.freeze({ kind: "invalidCredential" as const }));
  }
  return ok(Object.freeze({ credential: value, kind: "enabled" as const }));
}

/** Validates one optional memory-only provider credential without normalizing it. */
export function resolveOpenCodeZenConfiguration(
  value: string | undefined,
): Result<OpenCodeZenConfiguration, OpenCodeZenConfigurationError> {
  if (value === undefined) {
    return ok(Object.freeze({ kind: "disabled" as const }));
  }
  if (!isValidOpenCodeZenCredential(value)) {
    return err(Object.freeze({ kind: "invalidCredential" as const }));
  }
  return ok(Object.freeze({ credential: value, kind: "enabled" as const }));
}
