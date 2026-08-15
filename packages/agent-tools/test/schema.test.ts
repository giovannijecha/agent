import assert from "node:assert/strict";
import test from "node:test";

import {
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import {
  BooleanSchema,
  IntegerSchema,
  ListSchema,
  LiteralStringSchema,
  ObjectSchema,
  StringSchema,
  validateSchema,
} from "@agent/tools";

function inputSchema(): ObjectSchema {
  const path = StringSchema.create(1, 256);
  const depth = IntegerSchema.create(0, 8);
  assert.ok(path.ok);
  assert.ok(depth.ok);
  const tags = ListSchema.create(path.value, 0, 4);
  assert.ok(tags.ok);
  const object = ObjectSchema.create([
    {
      description: "Relative workspace path.",
      name: "path",
      required: true,
      schema: path.value,
    },
    {
      description: "Traversal depth.",
      name: "depth",
      required: false,
      schema: depth.value,
    },
    {
      description: "Optional labels.",
      name: "tags",
      required: false,
      schema: tags.value,
    },
    {
      description: "Whether hidden entries are included.",
      name: "hidden",
      required: false,
      schema: BooleanSchema.create(),
    },
  ]);
  assert.ok(object.ok);
  return object.value;
}

function value(input: unknown): StructuredObject {
  const result = structuredValueFromUnknown(input);
  assert.ok(result.ok && result.value instanceof StructuredObject);
  return result.value;
}

test("validates closed nested object schemas", () => {
  assert.equal(
    validateSchema(inputSchema(), value({
      depth: 2,
      hidden: false,
      path: "src",
      tags: ["owned"],
    })).ok,
    true,
  );
});

test("rejects missing, additional, wrong-type, and out-of-range fields", () => {
  const schema = inputSchema();
  for (const [input, kind] of [
    [{}, "missingField"],
    [{ path: "src", secret: true }, "additionalField"],
    [{ path: 1 }, "invalidType"],
    [{ depth: 9, path: "src" }, "outOfRange"],
  ] as const) {
    const result = validateSchema(schema, value(input));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, kind);
    }
  }
});

test("accepts only the exact owned string literal", () => {
  const literal = LiteralStringSchema.create("node");
  assert.ok(literal.ok);
  assert.equal(validateSchema(literal.value, "node").ok, true);
  const mismatch = validateSchema(literal.value, "nodejs");
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.error.kind, "outOfRange");
  }
  assert.equal(LiteralStringSchema.create("").ok, false);
  assert.equal(LiteralStringSchema.create("node\u0000").ok, false);
});

test("rejects malformed schema bounds and duplicate fields", () => {
  assert.equal(StringSchema.create(4, 3).ok, false);
  const text = StringSchema.create();
  assert.ok(text.ok);
  const duplicate = ObjectSchema.create([
    {
      description: "First.",
      name: "path",
      required: true,
      schema: text.value,
    },
    {
      description: "Second.",
      name: "path",
      required: false,
      schema: text.value,
    },
  ]);
  assert.equal(duplicate.ok, false);
});

test("enforces exact UTF-8 string limits without accepting unsafe scalars", () => {
  const text = StringSchema.create(0, 4_096, {
    maximumUtf8Bytes: 8_192,
    rejectNul: true,
  });
  assert.ok(text.ok);

  assert.equal(validateSchema(text.value, "\u6f22".repeat(2_730)).ok, true);
  for (const input of [
    "\u6f22".repeat(2_731),
    "owned\u0000text",
    "\ud800",
  ]) {
    const result = validateSchema(text.value, input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "outOfRange");
    }
  }
});

test("enforces declarative aggregate text limits across list items", () => {
  const text = StringSchema.create(0, 16, {
    maximumUtf8Bytes: 32,
    rejectNul: true,
  });
  assert.ok(text.ok);
  const item = ObjectSchema.create([
    {
      description: "Exact source anchor.",
      name: "oldText",
      required: true,
      schema: text.value,
    },
    {
      description: "Replacement text.",
      name: "newText",
      required: true,
      schema: text.value,
    },
  ]);
  assert.ok(item.ok);
  const schema = ListSchema.create(item.value, 1, 4, {
    maximumTextCodeUnits: 8,
    maximumTextUtf8Bytes: 10,
  });
  assert.ok(schema.ok);

  for (const [input, accepted] of [
    [[{ newText: "two", oldText: "one" }], true],
    [[{ newText: "four", oldText: "three" }], false],
    [[{ newText: "漢漢", oldText: "漢漢" }], false],
  ] as const) {
    const structured = structuredValueFromUnknown(input);
    assert.ok(structured.ok);
    const validated = validateSchema(schema.value, structured.value);
    assert.equal(validated.ok, accepted);
    if (!accepted && !validated.ok) {
      assert.equal(validated.error.kind, "outOfRange");
    }
  }

  assert.equal(
    ListSchema.create(item.value, 1, 4, {
      unexpected: 1,
    } as never).ok,
    false,
  );
});

test("rejects objects whose exact projection exceeds its aggregate limit", () => {
  const text = StringSchema.create(0, 64);
  assert.ok(text.ok);
  const schema = ObjectSchema.create(
    [
      {
        description: "First projected value.",
        name: "first",
        required: true,
        schema: text.value,
      },
      {
        description: "Second projected value.",
        name: "second",
        required: true,
        schema: text.value,
      },
    ],
    {
      fields: Object.freeze([
        Object.freeze({ mode: "exact" as const, name: "first" }),
        Object.freeze({ mode: "exact" as const, name: "second" }),
      ]),
      maximumCodeUnits: 32,
    },
  );
  assert.ok(schema.ok);

  assert.equal(
    validateSchema(schema.value, value({ first: "one", second: "two" })).ok,
    true,
  );
  const oversized = validateSchema(
    schema.value,
    value({ first: "x".repeat(12), second: "y".repeat(12) }),
  );
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.error.kind, "outOfRange");
  }
});

test("contains hostile schema arrays, proxies, and accessors", () => {
  const hostileFields = new Proxy([], {
    get(): never {
      throw new Error("private schema cause");
    },
  });
  assert.equal(
    ObjectSchema.create(
      hostileFields as unknown as ParametersNever,
    ).ok,
    false,
  );

  const revokedSchema = Proxy.revocable({}, {});
  revokedSchema.revoke();
  const hostileSchema = revokedSchema.proxy;
  const result = validateSchema(
    hostileSchema as never,
    value({ path: "src" }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalidType");
    assert.equal("cause" in result.error, false);
  }
});

type ParametersNever = readonly never[];
