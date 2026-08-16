export type ProviderId = "opencodeGo" | "opencodeZen";

export const PROVIDER_IDS: readonly ProviderId[] = Object.freeze([
  "opencodeGo",
  "opencodeZen",
]);

export function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === "string" &&
    PROVIDER_IDS.some((provider) => provider === value)
  );
}
