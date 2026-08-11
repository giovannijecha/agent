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
