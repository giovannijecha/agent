import {
  err,
  ok,
  StructuredList,
  StructuredObject,
  type StructuredValue,
  type Result,
} from "@agent/core";

export const TOOL_SCHEMA_LIMITS = Object.freeze({
  depth: 12,
  descriptionCodeUnits: 512,
  fields: 32,
  listItems: 1_024,
  stringCodeUnits: 262_144,
});

export type SchemaErrorKind =
  | "duplicateField"
  | "invalidBounds"
  | "invalidDescription"
  | "invalidFieldName"
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

  private constructor(minimum: number, maximum: number) {
    this.#minimum = minimum;
    this.#maximum = maximum;
    Object.freeze(this);
  }

  static create(
    minimum: number = 0,
    maximum: number = TOOL_SCHEMA_LIMITS.stringCodeUnits,
  ): Result<StringSchema, SchemaError> {
    return Number.isSafeInteger(minimum) &&
      Number.isSafeInteger(maximum) &&
      minimum >= 0 &&
      maximum >= minimum &&
      maximum <= TOOL_SCHEMA_LIMITS.stringCodeUnits
      ? ok(new StringSchema(minimum, maximum))
      : err(schemaError("invalidBounds"));
  }

  get maximum(): number {
    return this.#maximum;
  }

  get minimum(): number {
    return this.#minimum;
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
  | ObjectSchema
  | StringSchema;

export class ListSchema {
  readonly kind = "list" as const;
  readonly #item: ToolSchema;
  readonly #maximum: number;
  readonly #minimum: number;

  private constructor(item: ToolSchema, minimum: number, maximum: number) {
    this.#item = item;
    this.#minimum = minimum;
    this.#maximum = maximum;
    Object.freeze(this);
  }

  static create(
    item: ToolSchema,
    minimum: number = 0,
    maximum: number = TOOL_SCHEMA_LIMITS.listItems,
  ): Result<ListSchema, SchemaError> {
    try {
      if (
        !isOwnedSchema(item) ||
        !Number.isSafeInteger(minimum) ||
        !Number.isSafeInteger(maximum) ||
        minimum < 0 ||
        maximum < minimum ||
        maximum > TOOL_SCHEMA_LIMITS.listItems
      ) {
        return err(schemaError("invalidBounds"));
      }
      const depth = schemaDepth(item);
      return depth >= TOOL_SCHEMA_LIMITS.depth
        ? err(schemaError("tooDeep"))
        : ok(new ListSchema(item, minimum, maximum));
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
}

export type ObjectSchemaField = Readonly<{
  description: string;
  name: string;
  required: boolean;
  schema: ToolSchema;
}>;

export class ObjectSchema {
  readonly kind = "object" as const;
  readonly #fields: readonly ObjectSchemaField[];

  private constructor(fields: readonly ObjectSchemaField[]) {
    this.#fields = Object.freeze(
      fields.map((field) => Object.freeze({ ...field })),
    );
    Object.freeze(this);
  }

  static create(
    fields: readonly ObjectSchemaField[],
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
      return ok(new ObjectSchema(owned));
    } catch (_cause: unknown) {
      return err(schemaError("invalidFieldName"));
    }
  }

  get fields(): readonly ObjectSchemaField[] {
    return this.#fields;
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

/** Validates an owned structured value against a closed tool schema. */
function validateOwnedSchema(
  schema: ToolSchema,
  value: StructuredValue,
): Result<void, SchemaValidationError> {
  if (schema instanceof StringSchema) {
    return typeof value === "string" &&
      value.length >= schema.minimum &&
      value.length <= schema.maximum
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
    return ok(undefined);
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
  return matched === value.size
    ? ok(undefined)
    : err(validationError("additionalField"));
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
