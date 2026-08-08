import { err, ok, type Result } from "./result.js";

/** Hard bounds applied while snapshotting untrusted structured data. */
export const STRUCTURED_VALUE_LIMITS = Object.freeze({
  depth: 16,
  fields: 128,
  keyCodeUnits: 128,
  listItems: 1_024,
  nodes: 4_096,
  stringCodeUnits: 262_144,
  totalCodeUnits: 1_048_576,
});

export type StructuredValueErrorKind =
  | "cycle"
  | "invalidKey"
  | "invalidNumber"
  | "invalidObject"
  | "invalidType"
  | "tooDeep"
  | "tooManyEntries"
  | "tooManyNodes"
  | "tooMuchText";

/** Content-free reason why an untrusted structured value was rejected. */
export class StructuredValueError {
  readonly #kind: StructuredValueErrorKind;

  constructor(kind: StructuredValueErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): StructuredValueErrorKind {
    return this.#kind;
  }
}

export type StructuredScalar = null | boolean | number | string;
export type StructuredValue =
  | StructuredScalar
  | StructuredList
  | StructuredObject;

export type StructuredField = Readonly<{
  name: string;
  value: StructuredValue;
}>;

/** Immutable ordered structured list. */
export class StructuredList {
  readonly #codeUnits: number;
  readonly #values: readonly StructuredValue[];

  private constructor(values: readonly StructuredValue[], codeUnits: number) {
    this.#values = Object.freeze([...values]);
    this.#codeUnits = codeUnits;
    Object.freeze(this);
  }

  static owned(
    values: readonly StructuredValue[],
    codeUnits: number,
  ): StructuredList {
    return new StructuredList(values, codeUnits);
  }

  get codeUnits(): number {
    return this.#codeUnits;
  }

  get length(): number {
    return this.#values.length;
  }

  get values(): readonly StructuredValue[] {
    return this.#values;
  }
}

/** Immutable insertion-ordered structured object with unique owned fields. */
export class StructuredObject {
  readonly #codeUnits: number;
  readonly #fields: readonly StructuredField[];

  private constructor(fields: readonly StructuredField[], codeUnits: number) {
    this.#fields = Object.freeze(
      fields.map((field) => Object.freeze({ ...field })),
    );
    this.#codeUnits = codeUnits;
    Object.freeze(this);
  }

  static owned(
    fields: readonly StructuredField[],
    codeUnits: number,
  ): StructuredObject {
    return new StructuredObject(fields, codeUnits);
  }

  get codeUnits(): number {
    return this.#codeUnits;
  }

  get fields(): readonly StructuredField[] {
    return this.#fields;
  }

  get size(): number {
    return this.#fields.length;
  }

  /** Returns one field value without exposing a mutable object property bag. */
  get(name: string): StructuredValue | undefined {
    return this.#fields.find((field) => field.name === name)?.value;
  }
}

type SnapshotBudget = {
  nodes: number;
  textCodeUnits: number;
};

type Snapshot = Readonly<{
  codeUnits: number;
  value: StructuredValue;
}>;

const VALID_KEY = /^[A-Za-z][A-Za-z0-9_]*$/u;

function failure(kind: StructuredValueErrorKind): StructuredValueError {
  return new StructuredValueError(kind);
}

function addText(
  budget: SnapshotBudget,
  codeUnits: number,
): Result<void, StructuredValueError> {
  budget.textCodeUnits += codeUnits;
  return budget.textCodeUnits > STRUCTURED_VALUE_LIMITS.totalCodeUnits
    ? err(failure("tooMuchText"))
    : ok(undefined);
}

function enterNode(
  budget: SnapshotBudget,
  depth: number,
): Result<void, StructuredValueError> {
  if (depth > STRUCTURED_VALUE_LIMITS.depth) {
    return err(failure("tooDeep"));
  }
  budget.nodes += 1;
  return budget.nodes > STRUCTURED_VALUE_LIMITS.nodes
    ? err(failure("tooManyNodes"))
    : ok(undefined);
}

function snapshot(
  input: unknown,
  budget: SnapshotBudget,
  ancestors: Set<object>,
  depth: number,
): Result<Snapshot, StructuredValueError> {
  const entered = enterNode(budget, depth);
  if (!entered.ok) {
    return entered;
  }
  if (input === null || typeof input === "boolean") {
    return ok(Object.freeze({ codeUnits: 0, value: input }));
  }
  if (typeof input === "number") {
    return Number.isFinite(input)
      ? ok(Object.freeze({ codeUnits: 0, value: input }))
      : err(failure("invalidNumber"));
  }
  if (typeof input === "string") {
    if (input.length > STRUCTURED_VALUE_LIMITS.stringCodeUnits) {
      return err(failure("tooMuchText"));
    }
    const added = addText(budget, input.length);
    return added.ok
      ? ok(Object.freeze({ codeUnits: input.length, value: input }))
      : added;
  }
  if (typeof input !== "object") {
    return err(failure("invalidType"));
  }

  if (ancestors.has(input)) {
    return err(failure("cycle"));
  }
  ancestors.add(input);
  try {
    if (input instanceof StructuredList) {
      return snapshotList(
        (input as StructuredList).values,
        budget,
        ancestors,
        depth,
      );
    }
    if (input instanceof StructuredObject) {
      return snapshotFields(
        (input as StructuredObject).fields,
        budget,
        ancestors,
        depth,
      );
    }
    if (Array.isArray(input)) {
      return snapshotList(input, budget, ancestors, depth);
    }
    const entries = Object.entries(input).map(([name, value]) =>
      Object.freeze({ name, value }),
    );
    return snapshotFields(entries, budget, ancestors, depth);
  } catch (_cause: unknown) {
    return err(failure("invalidObject"));
  } finally {
    ancestors.delete(input);
  }
}

function snapshotList(
  input: readonly unknown[],
  budget: SnapshotBudget,
  ancestors: Set<object>,
  depth: number,
): Result<Snapshot, StructuredValueError> {
  let length: number;
  try {
    length = input.length;
  } catch (_cause: unknown) {
    return err(failure("invalidObject"));
  }
  if (length > STRUCTURED_VALUE_LIMITS.listItems) {
    return err(failure("tooManyEntries"));
  }
  const values: StructuredValue[] = [];
  let codeUnits = 0;
  for (let index = 0; index < length; index += 1) {
    let item: unknown;
    try {
      item = input.at(index);
    } catch (_cause: unknown) {
      return err(failure("invalidObject"));
    }
    const child = snapshot(item, budget, ancestors, depth + 1);
    if (!child.ok) {
      return child;
    }
    values.push(child.value.value);
    codeUnits += child.value.codeUnits;
  }
  return ok(
    Object.freeze({
      codeUnits,
      value: StructuredList.owned(values, codeUnits),
    }),
  );
}

function snapshotFields(
  input: readonly Readonly<{ name: unknown; value: unknown }>[],
  budget: SnapshotBudget,
  ancestors: Set<object>,
  depth: number,
): Result<Snapshot, StructuredValueError> {
  if (input.length > STRUCTURED_VALUE_LIMITS.fields) {
    return err(failure("tooManyEntries"));
  }
  const names = new Set<string>();
  const fields: StructuredField[] = [];
  let codeUnits = 0;
  for (const field of input) {
    let name: unknown;
    let value: unknown;
    try {
      name = field.name;
      value = field.value;
    } catch (_cause: unknown) {
      return err(failure("invalidObject"));
    }
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.length > STRUCTURED_VALUE_LIMITS.keyCodeUnits ||
      !VALID_KEY.test(name) ||
      names.has(name)
    ) {
      return err(failure("invalidKey"));
    }
    names.add(name);
    const added = addText(budget, name.length);
    if (!added.ok) {
      return added;
    }
    const child = snapshot(value, budget, ancestors, depth + 1);
    if (!child.ok) {
      return child;
    }
    codeUnits += name.length + child.value.codeUnits;
    fields.push(Object.freeze({ name, value: child.value.value }));
  }
  return ok(
    Object.freeze({
      codeUnits,
      value: StructuredObject.owned(fields, codeUnits),
    }),
  );
}

/** Snapshots a foreign JSON-shaped value into the owned immutable model. */
export function structuredValueFromUnknown(
  input: unknown,
): Result<StructuredValue, StructuredValueError> {
  const result = snapshot(input, { nodes: 0, textCodeUnits: 0 }, new Set(), 0);
  return result.ok ? ok(result.value.value) : result;
}

/** Returns the aggregate key and string code units retained by a value. */
export function structuredValueCodeUnits(value: StructuredValue): number {
  if (typeof value === "string") {
    return value.length;
  }
  if (value instanceof StructuredList || value instanceof StructuredObject) {
    return value.codeUnits;
  }
  return 0;
}
