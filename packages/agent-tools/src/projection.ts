import {
  StructuredList,
  StructuredObject,
  type StructuredValue,
} from "@agent/core";

export type StructuredProjectionField = Readonly<{
  mode: "exact" | "size";
  name: string;
}>;

const UNSAFE_PROJECTION_SCALAR = /[\p{C}\p{Zl}\p{Zp}]/u;
const LIST_OPEN = "[";
const LIST_CLOSE = "]";

function safeString(value: string): string {
  let visible = "";
  for (const scalar of value) {
    const point = scalar.codePointAt(0);
    visible +=
      point !== undefined && UNSAFE_PROJECTION_SCALAR.test(scalar)
        ? "\\u{" + point.toString(16).padStart(4, "0") + "}"
        : scalar;
  }
  const encoded = JSON.stringify(visible);
  return typeof encoded === "string" ? encoded : "\"\"";
}

function exactValue(value: StructuredValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return safeString(value);
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (value instanceof StructuredList) {
    return (
      LIST_OPEN +
      value.values.map((item) => exactValue(item)).join(",") +
      LIST_CLOSE
    );
  }
  return (
    "{" +
    value.fields
      .map((field) => field.name + ":" + exactValue(field.value))
      .join(",") +
    "}"
  );
}

function sizedValue(value: StructuredValue): string {
  return typeof value === "string"
    ? "<" + String(value.length) + " code units>"
    : value instanceof StructuredList
      ? "<" + String(value.length) + " items>"
      : value instanceof StructuredObject
        ? "<" + String(value.size) + " fields>"
        : exactValue(value);
}

/** Renders one deterministic, bounded projection of structured object fields. */
export function renderStructuredProjection(
  fields: readonly StructuredProjectionField[],
  input: StructuredObject,
  maximumCodeUnits: number,
): string | undefined {
  try {
    if (
      !Array.isArray(fields) ||
      !(input instanceof StructuredObject) ||
      !Number.isSafeInteger(maximumCodeUnits) ||
      maximumCodeUnits < 0
    ) {
      return undefined;
    }
    const parts: string[] = [];
    let codeUnits = 0;
    for (const field of fields) {
      const value = input.get(field.name);
      if (value === undefined) {
        continue;
      }
      const part =
        field.name +
        "=" +
        (field.mode === "exact" ? exactValue(value) : sizedValue(value));
      codeUnits += part.length + (parts.length === 0 ? 0 : 1);
      if (codeUnits > maximumCodeUnits) {
        return undefined;
      }
      parts.push(part);
    }
    return parts.join(" ");
  } catch (_cause: unknown) {
    return undefined;
  }
}
