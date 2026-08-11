import assert from "node:assert/strict";
import test from "node:test";

import { err, ok, StructuredObject, structuredValueFromUnknown } from "@agent/core";
import {
  ObjectSchema,
  StringSchema,
  ToolDescriptor,
  ToolEngine,
  ToolRegistry,
  type ToolCancellation,
  type ToolHandler,
} from "@agent/tools";

const cancellation: ToolCancellation = Object.freeze({
  requested: false,
  whenRequested: async () => new Promise<void>(() => undefined),
});

function createEngine(handler: ToolHandler): ToolEngine {
  const text = StringSchema.create(1, 128);
  assert.ok(text.ok);
  const schema = ObjectSchema.create([
    {
      description: "Relative workspace path.",
      name: "path",
      required: true,
      schema: text.value,
    },
  ]);
  assert.ok(schema.ok);
  const descriptor = ToolDescriptor.create(
    "read_file",
    "Read one bounded workspace file.",
    "read",
    schema.value,
  );
  assert.ok(descriptor.ok);
  const registry = ToolRegistry.create([
    { descriptor: descriptor.value, handler },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  return engine.value;
}

function input(): StructuredObject {
  const value = structuredValueFromUnknown({ path: "src/index.ts" });
  assert.ok(value.ok && value.value instanceof StructuredObject);
  return value.value;
}

test("prepares, validates, and executes an immutable tool call", async () => {
  const engine = createEngine(async (received) => {
    assert.equal(received.get("path"), "src/index.ts");
    return ok({ text: "owned" });
  });
  const prepared = engine.prepare("call-1", "read_file", input());
  assert.ok(prepared.ok);
  const executed = await engine.execute(prepared.value, cancellation);
  assert.ok(executed.ok);
  assert.equal(executed.value.result.status, "success");
  assert.equal(executed.value.contractFailure, false);
  assert.equal(executed.value.call.name, "read_file");
  assert.equal(engine.descriptors.at(0)?.risk, "read");
});

test("turns expected handler failures and denial into structured results", async () => {
  const engine = createEngine(async () => err(Object.freeze({ kind: "io" })));
  const prepared = engine.prepare("call-2", "read_file", input());
  assert.ok(prepared.ok);
  const failed = await engine.execute(prepared.value, cancellation);
  assert.ok(failed.ok);
  assert.equal(failed.value.result.status, "failure");
  const denied = engine.deny(prepared.value);
  assert.ok(denied.ok);
  assert.equal(denied.value.result.status, "failure");
});

test("records a prepared but uninvoked call without running its handler", () => {
  let handlerCalls = 0;
  const engine = createEngine(async () => {
    handlerCalls += 1;
    return ok({ text: "unreachable" });
  });
  const prepared = engine.prepare("call-blocked", "read_file", input());
  assert.ok(prepared.ok);

  const blocked = engine.notRun(prepared.value, "blocked");

  assert.ok(blocked.ok);
  assert.equal(handlerCalls, 0);
  assert.equal(blocked.value.contractFailure, false);
  assert.equal(blocked.value.result.status, "failure");
  assert.ok(blocked.value.result.output instanceof StructuredObject);
  assert.equal(blocked.value.result.output.get("attempted"), false);
  assert.equal(blocked.value.result.output.get("error"), "blocked");
});

test("contains thrown and malformed handler boundaries", async () => {
  const thrown = createEngine(async () => {
    throw new Error("private cause");
  });
  const prepared = thrown.prepare("call-3", "read_file", input());
  assert.ok(prepared.ok);
  const result = await thrown.execute(prepared.value, cancellation);
  assert.ok(result.ok);
  assert.equal(result.value.result.status, "failure");
  assert.equal(result.value.contractFailure, true);

  const malformed = createEngine(
    async () => ({ ok: true } as unknown as ReturnType<ToolHandler> extends Promise<infer R> ? R : never),
  );
  const malformedCall = malformed.prepare("call-4", "read_file", input());
  assert.ok(malformedCall.ok);
  const malformedResult = await malformed.execute(
    malformedCall.value,
    cancellation,
  );
  assert.ok(malformedResult.ok);
  assert.equal(malformedResult.value.result.status, "failure");
  assert.equal(malformedResult.value.contractFailure, true);
});

test("rejects unknown tools, invalid inputs, and duplicate registrations", () => {
  const engine = createEngine(async () => ok({}));
  assert.equal(engine.prepare("call-5", "missing", input()).ok, false);
  assert.equal(
    engine.prepare("call-5", "read_file", { unexpected: true }).ok,
    false,
  );

  const descriptor = engine.descriptors.at(0);
  assert.ok(descriptor !== undefined);
  const duplicate = ToolRegistry.create([
    { descriptor, handler: async () => ok({}) },
    { descriptor, handler: async () => ok({}) },
  ]);
  assert.equal(duplicate.ok, false);
});

test("contains hostile descriptor, registry, and prepared-call proxies", async () => {
  const revokedSchema = Proxy.revocable({}, {});
  revokedSchema.revoke();
  const hostileSchema = revokedSchema.proxy;
  assert.equal(
    ToolDescriptor.create(
      "read_file",
      "Read a file.",
      "read",
      hostileSchema as never,
    ).ok,
    false,
  );

  const hostileRegistrations = new Proxy([], {
    get(): never {
      throw new Error("private registry cause");
    },
  });
  assert.equal(ToolRegistry.create(hostileRegistrations as never).ok, false);

  const engine = createEngine(async () => ok({}));
  const revokedPrepared = Proxy.revocable({}, {});
  revokedPrepared.revoke();
  const hostilePrepared = revokedPrepared.proxy;
  assert.equal(engine.deny(hostilePrepared as never).ok, false);
  assert.equal(engine.notRun(hostilePrepared as never, "blocked").ok, false);
  const executed = await engine.execute(hostilePrepared as never, cancellation);
  assert.equal(executed.ok, false);
  if (!executed.ok) {
    assert.equal(executed.error.kind, "invalidPreparedCall");
    assert.equal("cause" in executed.error, false);
  }
});

test("checkpoints invalid output as a generic post-invocation failure", async () => {
  const engine = createEngine(async () => ok({ text: "x".repeat(262_145) }));
  const prepared = engine.prepare("call-limit", "read_file", input());
  assert.ok(prepared.ok);

  const result = await engine.execute(prepared.value, cancellation);

  assert.ok(result.ok);
  assert.equal(result.value.result.status, "failure");
  assert.equal(result.value.contractFailure, true);
});

test("enforces one caller-owned output budget without losing attempted-call truth", async () => {
  let handlerCalls = 0;
  const engine = createEngine(async () => {
    handlerCalls += 1;
    return ok({ text: "x".repeat(64) });
  });
  const prepared = engine.prepare("call-budget", "read_file", input());
  assert.ok(prepared.ok);

  const invalid = await engine.execute(prepared.value, cancellation, 22);
  assert.deepEqual(invalid, { ok: false, error: { kind: "invalidLimit" } });
  assert.equal(handlerCalls, 0);

  const bounded = await engine.execute(prepared.value, cancellation, 23);
  assert.ok(bounded.ok);
  assert.equal(handlerCalls, 1);
  assert.equal(bounded.value.result.status, "failure");
  assert.equal(bounded.value.contractFailure, true);
  assert.ok(bounded.value.result.output instanceof StructuredObject);
  assert.equal(bounded.value.result.output.get("error"), "internal");
});

test("requires bounded approval fields for mutation descriptors", () => {
  const text = StringSchema.create(1, 128);
  assert.ok(text.ok);
  const schema = ObjectSchema.create([
    {
      description: "Relative workspace path.",
      name: "path",
      required: true,
      schema: text.value,
    },
  ]);
  assert.ok(schema.ok);
  assert.equal(
    ToolDescriptor.create("write_file", "Write a file.", "write", schema.value)
      .ok,
    false,
  );
  const descriptor = ToolDescriptor.create(
    "write_file",
    "Write a file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(descriptor.ok);
});

test("escapes invisible and directional scalars in approval summaries", () => {
  const text = StringSchema.create(1, 128);
  assert.ok(text.ok);
  const schema = ObjectSchema.create([
    {
      description: "Relative workspace path.",
      name: "path",
      required: true,
      schema: text.value,
    },
  ]);
  assert.ok(schema.ok);
  const descriptor = ToolDescriptor.create(
    "write_file",
    "Write a file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(descriptor.ok);
  const registry = ToolRegistry.create([
    { descriptor: descriptor.value, handler: async () => ok({}) },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  const hostile = structuredValueFromUnknown({
    path: "docs/\u202Egnp.exe\u200B",
  });
  assert.ok(hostile.ok && hostile.value instanceof StructuredObject);

  const prepared = engine.value.prepare(
    "call-unicode",
    "write_file",
    hostile.value,
  );

  assert.ok(prepared.ok);
  assert.equal(prepared.value.approvalPreview.includes("\u202E"), false);
  assert.equal(prepared.value.approvalPreview.includes("\u200B"), false);
  assert.equal(prepared.value.approvalPreview.includes("\\u{202e}"), true);
  assert.equal(prepared.value.approvalPreview.includes("\\u{200b}"), true);
});
