import {
  err,
  ok,
  scalarUtf8ByteLength,
  StructuredList,
  StructuredObject,
  type StructuredValue,
  type Result,
} from "@agent/core";

import {
  renderStructuredProjection,
  structuredStringProjectionCodeUnits,
  type StructuredProjectionField,
} from "./projection.js";

export const TOOL_SCHEMA_LIMITS = Object.freeze({
  aggregateTextCodeUnits: 1_048_576,
  aggregateTextUtf8Bytes: 4_194_304,
  depth: 12,
  descriptionCodeUnits: 512,
  fields: 32,
  listItems: 1_024,
  projectionCodeUnits: 262_144,
  stringCodeUnits: 262_144,
  stringUtf8Bytes: 1_048_576,
});

export type SchemaErrorKind =
  | "duplicateField"
  | "invalidBounds"
  | "invalidDescription"
  | "invalidFieldName"
  | "invalidLiteral"
  | "invalidProjection"
  | "tooDeep"
  | "tooManyFields";

export type SchemaError = Readonly<{ kind: SchemaErrorKind }>;
export type SchemaValidationErrorKind =
  | "additionalField"
  | "invalidType"
  | "missingField"
  | "outOfRange";
export type SchemaValidationError = Readonly<{
  kind: SchemaValidationErrorKind;
}>;

function schemaError(kind: SchemaErrorKind): SchemaError {
  return Object.freeze({ kind });
}

function validationError(
  kind: SchemaValidationErrorKind,
): SchemaValidationError {
  return Object.freeze({ kind });
}

function validDescription(value: string): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= TOOL_SCHEMA_LIMITS.descriptionCodeUnits &&
    !/\p{Cc}/u.test(value)
  );
}

const VALID_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/u;

export class StringSchema {
  readonly kind = "string" as const;
  readonly #maximum: number;
  readonly #minimum: number;
  readonly #maximumProjectionCodeUnits: number | undefined;
  readonly #maximumUtf8Bytes: number | undefined;
  readonly #rejectNul: boolean;

  private constructor(
    minimum: number,
    maximum: number,
    maximumProjectionCodeUnits: number | undefined,
    maximumUtf8Bytes: number | undefined,
    rejectNul: boolean,
  ) {
    this.#minimum = minimum;
    this.#maximum = maximum;
    this.#maximumProjectionCodeUnits = maximumProjectionCodeUnits;
    this.#maximumUtf8Bytes = maximumUtf8Bytes;
    this.#rejectNul = rejectNul;
    Object.freeze(this);
  }

  static create(
    minimum: number = 0,
    maximum: number = TOOL_SCHEMA_LIMITS.stringCodeUnits,
    options: StringSchemaOptions = Object.freeze({}),
  ): Result<StringSchema, SchemaError> {
    try {
      const validKeys = Object.keys(options).every(
        (key) =>
          key === "maximumProjectionCodeUnits" ||
          key === "maximumUtf8Bytes" ||
          key === "rejectNul",
      );
      const maximumProjectionCodeUnits =
        options.maximumProjectionCodeUnits;
      const maximumUtf8Bytes = options.maximumUtf8Bytes;
      const rejectNul = options.rejectNul ?? false;
      return Number.isSafeInteger(minimum) &&
        Number.isSafeInteger(maximum) &&
        minimum >= 0 &&
        maximum >= minimum &&
        maximum <= TOOL_SCHEMA_LIMITS.stringCodeUnits &&
        validKeys &&
        (maximumProjectionCodeUnits === undefined ||
          (Number.isSafeInteger(maximumProjectionCodeUnits) &&
            maximumProjectionCodeUnits >= 0 &&
            maximumProjectionCodeUnits <=
              TOOL_SCHEMA_LIMITS.projectionCodeUnits)) &&
        (maximumUtf8Bytes === undefined ||
          (Number.isSafeInteger(maximumUtf8Bytes) &&
            maximumUtf8Bytes >= 0 &&
            maximumUtf8Bytes <= TOOL_SCHEMA_LIMITS.stringUtf8Bytes)) &&
        typeof rejectNul === "boolean"
        ? ok(
            new StringSchema(
              minimum,
              maximum,
              maximumProjectionCodeUnits,
              maximumUtf8Bytes,
              rejectNul,
            ),
          )
        : err(schemaError("invalidBounds"));
    } catch (_cause: unknown) {
      return err(schemaError("invalidBounds"));
    }
  }

  get maximum(): number {
    return this.#maximum;
  }

  get minimum(): number {
    return this.#minimum;
  }

  get maximumProjectionCodeUnits(): number | undefined {
    return this.#maximumProjectionCodeUnits;
  }

  get maximumUtf8Bytes(): number | undefined {
    return this.#maximumUtf8Bytes;
  }

  get rejectNul(): boolean {
    return this.#rejectNul;
  }
}

export type StringSchemaOptions = Readonly<{
  maximumProjectionCodeUnits?: number;
  maximumUtf8Bytes?: number;
  rejectNul?: boolean;
}>;

export class LiteralStringSchema {
  readonly kind = "literalString" as const;
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  static create(value: string): Result<LiteralStringSchema, SchemaError> {
    return typeof value === "string" &&
      value.length > 0 &&
      value.length <= 128 &&
      !/\p{Cc}/u.test(value)
      ? ok(new LiteralStringSchema(value))
      : err(schemaError("invalidLiteral"));
  }

  get value(): string {
    return this.#value;
  }
}

export class IntegerSchema {
  readonly kind = "integer" as const;
  readonly #maximum: number;
  readonly #minimum: number;

  private constructor(minimum: number, maximum: number) {
    this.#minimum = minimum;
    this.#maximum = maximum;
    Object.freeze(this);
  }

  static create(
    minimum: number,
    maximum: number,
  ): Result<IntegerSchema, SchemaError> {
    return Number.isSafeInteger(minimum) &&
      Number.isSafeInteger(maximum) &&
      maximum >= minimum
      ? ok(new IntegerSchema(minimum, maximum))
      : err(schemaError("invalidBounds"));
  }

  get maximum(): number {
    return this.#maximum;
  }

  get minimum(): number {
    return this.#minimum;
  }
}

export class BooleanSchema {
  readonly kind = "boolean" as const;

  private constructor() {
    Object.freeze(this);
  }

  static create(): BooleanSchema {
    return new BooleanSchema();
  }
}

export type ToolSchema =
  | BooleanSchema
  | IntegerSchema
  | ListSchema
  | LiteralStringSchema
  | ObjectSchema
  | StringSchema;

export type ListSchemaOptions = Readonly<{
  maximumTextCodeUnits?: number;
  maximumTextUtf8Bytes?: number;
}>;

export class ListSchema {
  readonly kind = "list" as const;
  readonly #item: ToolSchema;
  readonly #maximum: number;
  readonly #minimum: number;
  readonly #maximumTextCodeUnits: number | undefined;
  readonly #maximumTextUtf8Bytes: number | undefined;

  private constructor(
    item: ToolSchema,
    minimum: number,
    maximum: number,
    maximumTextCodeUnits: number | undefined,
    maximumTextUtf8Bytes: number | undefined,
  ) {
    this.#item = item;
    this.#minimum = minimum;
    this.#maximum = maximum;
    this.#maximumTextCodeUnits = maximumTextCodeUnits;
    this.#maximumTextUtf8Bytes = maximumTextUtf8Bytes;
    Object.freeze(this);
  }

  static create(
    item: ToolSchema,
    minimum: number = 0,
    maximum: number = TOOL_SCHEMA_LIMITS.listItems,
    options: ListSchemaOptions = Object.freeze({}),
  ): Result<ListSchema, SchemaError> {
    try {
      const keys = Object.keys(options).sort().join(",");
      const maximumTextCodeUnits = options.maximumTextCodeUnits;
      const maximumTextUtf8Bytes = options.maximumTextUtf8Bytes;
      if (
        !isOwnedSchema(item) ||
        !Number.isSafeInteger(minimum) ||
        !Number.isSafeInteger(maximum) ||
        minimum < 0 ||
        maximum < minimum ||
        maximum > TOOL_SCHEMA_LIMITS.listItems ||
        (keys !== "" &&
          keys !== "maximumTextCodeUnits" &&
          keys !== "maximumTextCodeUnits,maximumTextUtf8Bytes" &&
          keys !== "maximumTextUtf8Bytes") ||
        (maximumTextCodeUnits !== undefined &&
          (!Number.isSafeInteger(maximumTextCodeUnits) ||
            maximumTextCodeUnits < 0 ||
            maximumTextCodeUnits >
              TOOL_SCHEMA_LIMITS.aggregateTextCodeUnits)) ||
        (maximumTextUtf8Bytes !== undefined &&
          (!Number.isSafeInteger(maximumTextUtf8Bytes) ||
            maximumTextUtf8Bytes < 0 ||
            maximumTextUtf8Bytes >
              TOOL_SCHEMA_LIMITS.aggregateTextUtf8Bytes))
      ) {
        return err(schemaError("invalidBounds"));
      }
      const depth = schemaDepth(item);
      return depth >= TOOL_SCHEMA_LIMITS.depth
        ? err(schemaError("tooDeep"))
        : ok(
            new ListSchema(
              item,
              minimum,
              maximum,
              maximumTextCodeUnits,
              maximumTextUtf8Bytes,
            ),
          );
    } catch (_cause: unknown) {
      return err(schemaError("invalidBounds"));
    }
  }

  get item(): ToolSchema {
    return this.#item;
  }

  get maximum(): number {
    return this.#maximum;
  }

  get minimum(): number {
    return this.#minimum;
  }

  get maximumTextCodeUnits(): number | undefined {
    return this.#maximumTextCodeUnits;
  }

  get maximumTextUtf8Bytes(): number | undefined {
    return this.#maximumTextUtf8Bytes;
  }
}

export type ObjectSchemaField = Readonly<{
  description: string;
  name: string;
  required: boolean;
  schema: ToolSchema;
}>;

export type ObjectSchemaProjection = Readonly<{
  fields: readonly StructuredProjectionField[];
  maximumCodeUnits: number;
}>;

export class ObjectSchema {
  readonly kind = "object" as const;
  readonly #fields: readonly ObjectSchemaField[];
  readonly #projection: ObjectSchemaProjection | undefined;

  private constructor(
    fields: readonly ObjectSchemaField[],
    projection: ObjectSchemaProjection | undefined,
  ) {
    this.#fields = Object.freeze(
      fields.map((field) => Object.freeze({ ...field })),
    );
    this.#projection =
      projection === undefined
        ? undefined
        : Object.freeze({
            fields: Object.freeze(
              projection.fields.map((field) => Object.freeze({ ...field })),
            ),
            maximumCodeUnits: projection.maximumCodeUnits,
          });
    Object.freeze(this);
  }

  static create(
    fields: readonly ObjectSchemaField[],
    projection?: ObjectSchemaProjection,
  ): Result<ObjectSchema, SchemaError> {
    try {
      if (!Array.isArray(fields)) {
        return err(schemaError("invalidFieldName"));
      }
      if (fields.length > TOOL_SCHEMA_LIMITS.fields) {
        return err(schemaError("tooManyFields"));
      }
      const names = new Set<string>();
      const owned: ObjectSchemaField[] = [];
      for (const field of fields) {
        let description: unknown;
        let name: unknown;
        let required: unknown;
        let schema: unknown;
        description = field.description;
        name = field.name;
        required = field.required;
        schema = field.schema;
        if (
          typeof name !== "string" ||
          name.length > 128 ||
          !VALID_FIELD_NAME.test(name)
        ) {
          return err(schemaError("invalidFieldName"));
        }
        if (names.has(name)) {
          return err(schemaError("duplicateField"));
        }
        if (
          typeof description !== "string" ||
          !validDescription(description)
        ) {
          return err(schemaError("invalidDescription"));
        }
        if (typeof required !== "boolean" || !isOwnedSchema(schema)) {
          return err(schemaError("invalidBounds"));
        }
        if (schemaDepth(schema) >= TOOL_SCHEMA_LIMITS.depth) {
          return err(schemaError("tooDeep"));
        }
        names.add(name);
        owned.push(Object.freeze({ description, name, required, schema }));
      }
      let ownedProjection: ObjectSchemaProjection | undefined;
      if (projection !== undefined) {
        if (
          projection === null ||
          typeof projection !== "object" ||
          Object.keys(projection).sort().join(",") !==
            "fields,maximumCodeUnits" ||
          !Array.isArray(projection.fields) ||
          projection.fields.length > TOOL_SCHEMA_LIMITS.fields ||
          !Number.isSafeInteger(projection.maximumCodeUnits) ||
          projection.maximumCodeUnits < 0 ||
          projection.maximumCodeUnits > TOOL_SCHEMA_LIMITS.projectionCodeUnits
        ) {
          return err(schemaError("invalidProjection"));
        }
        const projected = new Set<string>();
        const projectedFields: StructuredProjectionField[] = [];
        for (const field of projection.fields) {
          const fieldName = field.name;
          const mode = field.mode;
          if (
            Object.keys(field).sort().join(",") !== "mode,name" ||
            typeof fieldName !== "string" ||
            (mode !== "exact" && mode !== "size") ||
            projected.has(fieldName) ||
            !names.has(fieldName)
          ) {
            return err(schemaError("invalidProjection"));
          }
          projected.add(fieldName);
          projectedFields.push(Object.freeze({ mode, name: fieldName }));
        }
        ownedProjection = Object.freeze({
          fields: Object.freeze(projectedFields),
          maximumCodeUnits: projection.maximumCodeUnits,
        });
      }
      return ok(new ObjectSchema(owned, ownedProjection));
    } catch (_cause: unknown) {
      return err(schemaError("invalidFieldName"));
    }
  }

  get fields(): readonly ObjectSchemaField[] {
    return this.#fields;
  }

  get projection(): ObjectSchemaProjection | undefined {
    return this.#projection;
  }
}

function isOwnedSchema(value: unknown): value is ToolSchema {
  if (value === null || typeof value !== "object") {
    return false;
  }
  try {
    return (
      value instanceof BooleanSchema ||
      value instanceof IntegerSchema ||
      value instanceof ListSchema ||
      value instanceof LiteralStringSchema ||
      value instanceof ObjectSchema ||
      value instanceof StringSchema
    );
  } catch (_cause: unknown) {
    return false;
  }
}

function schemaDepth(schema: ToolSchema): number {
  if (schema instanceof ListSchema) {
    return 1 + schemaDepth(schema.item);
  }
  if (schema instanceof ObjectSchema) {
    let maximum = 0;
    for (const field of schema.fields) {
      maximum = Math.max(maximum, schemaDepth(field.schema));
    }
    return 1 + maximum;
  }
  return 1;
}

function withinAggregateTextBounds(
  value: StructuredValue,
  maximumCodeUnits: number | undefined,
  maximumUtf8Bytes: number | undefined,
): boolean {
  let codeUnits = 0;
  let utf8Bytes = 0;
  function visit(current: StructuredValue): boolean {
    if (typeof current === "string") {
      codeUnits += current.length;
      if (maximumCodeUnits !== undefined && codeUnits > maximumCodeUnits) {
        return false;
      }
      if (maximumUtf8Bytes !== undefined) {
        const bytes = scalarUtf8ByteLength(current, false);
        if (bytes === undefined) {
          return false;
        }
        utf8Bytes += bytes;
        if (utf8Bytes > maximumUtf8Bytes) {
          return false;
        }
      }
      return true;
    }
    if (current instanceof StructuredList) {
      for (const item of current.values) {
        if (!visit(item)) {
          return false;
        }
      }
      return true;
    }
    if (current instanceof StructuredObject) {
      for (const field of current.fields) {
        if (!visit(field.value)) {
          return false;
        }
      }
    }
    return true;
  }
  return visit(value);
}

/** Validates an owned structured value against a closed tool schema. */
function validateOwnedSchema(
  schema: ToolSchema,
  value: StructuredValue,
): Result<void, SchemaValidationError> {
  if (schema instanceof StringSchema) {
    if (typeof value !== "string") {
      return err(validationError("invalidType"));
    }
    if (value.length < schema.minimum || value.length > schema.maximum) {
      return err(validationError("outOfRange"));
    }
    if (schema.maximumProjectionCodeUnits !== undefined) {
      const projected = structuredStringProjectionCodeUnits(value);
      if (
        projected === undefined ||
        projected > schema.maximumProjectionCodeUnits
      ) {
        return err(validationError("outOfRange"));
      }
    }
    if (schema.rejectNul || schema.maximumUtf8Bytes !== undefined) {
      const bytes = scalarUtf8ByteLength(value, schema.rejectNul);
      if (
        bytes === undefined ||
        (schema.maximumUtf8Bytes !== undefined &&
          bytes > schema.maximumUtf8Bytes)
      ) {
        return err(validationError("outOfRange"));
      }
    }
    return ok(undefined);
  }
  if (schema instanceof LiteralStringSchema) {
    return typeof value === "string" && value === schema.value
      ? ok(undefined)
      : err(
          validationError(
            typeof value === "string" ? "outOfRange" : "invalidType",
          ),
        );
  }
  if (schema instanceof IntegerSchema) {
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= schema.minimum &&
      value <= schema.maximum
      ? ok(undefined)
      : err(
          validationError(
            typeof value === "number" ? "outOfRange" : "invalidType",
          ),
        );
  }
  if (schema instanceof BooleanSchema) {
    return typeof value === "boolean"
      ? ok(undefined)
      : err(validationError("invalidType"));
  }
  if (schema instanceof ListSchema) {
    if (!(value instanceof StructuredList)) {
      return err(validationError("invalidType"));
    }
    if (value.length < schema.minimum || value.length > schema.maximum) {
      return err(validationError("outOfRange"));
    }
    for (const item of value.values) {
      const valid = validateOwnedSchema(schema.item, item);
      if (!valid.ok) {
        return valid;
      }
    }
    return withinAggregateTextBounds(
      value,
      schema.maximumTextCodeUnits,
      schema.maximumTextUtf8Bytes,
    )
      ? ok(undefined)
      : err(validationError("outOfRange"));
  }
  if (!(value instanceof StructuredObject)) {
    return err(validationError("invalidType"));
  }
  let matched = 0;
  for (const field of schema.fields) {
    const item = value.get(field.name);
    if (item === undefined) {
      if (field.required) {
        return err(validationError("missingField"));
      }
      continue;
    }
    matched += 1;
    const valid = validateOwnedSchema(field.schema, item);
    if (!valid.ok) {
      return valid;
    }
  }
  if (matched !== value.size) {
    return err(validationError("additionalField"));
  }
  return schema.projection === undefined ||
    renderStructuredProjection(
      schema.projection.fields,
      value,
      schema.projection.maximumCodeUnits,
    ) !== undefined
    ? ok(undefined)
    : err(validationError("outOfRange"));
}

/** Validates at a total boundary and contains hostile proxy access. */
export function validateSchema(
  schema: ToolSchema,
  value: StructuredValue,
): Result<void, SchemaValidationError> {
  try {
    return isOwnedSchema(schema)
      ? validateOwnedSchema(schema, value)
      : err(validationError("invalidType"));
  } catch (_cause: unknown) {
    return err(validationError("invalidType"));
  }
}
