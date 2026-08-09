import { err, ok, type Result } from "@agent/core";

export const OPENCODE_GO_API_KEY_VARIABLE = "AGENT_OPENCODE_GO_API_KEY";

export type OpenCodeGoConfiguration =
  | Readonly<{ kind: "disabled" }>
  | Readonly<{ credential: string; kind: "enabled" }>;
export type OpenCodeGoConfigurationError = Readonly<{
  kind: "invalidCredential";
}>;

export function isValidOpenCodeGoCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 8_192 &&
    !/\s|\p{Cc}/u.test(value)
  );
}

/** Validates one optional memory-only provider credential without normalizing it. */
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
