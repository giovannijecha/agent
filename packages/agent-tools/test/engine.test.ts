import assert from "node:assert/strict";
import test from "node:test";

import { err, ok, StructuredObject, structuredValueFromUnknown } from "@agent/core";
import {
  ObjectSchema,
  StringSchema,
  TOOL_ENGINE_LIMITS,
  ToolDescriptor,
  ToolEffectPlan,
  ToolEngine,
  ToolHandlerOutcome,
  ToolRegistry,
  type ToolCancellation,
  type ToolHandler,
  type PlannedToolCall,
  type PreparedToolCall,
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

async function plan(
  engine: ToolEngine,
  prepared: PreparedToolCall,
): Promise<PlannedToolCall> {
  const planned = await engine.plan(prepared, cancellation);
  assert.ok(planned.ok);
  return planned.value;
}

test("prepares, validates, and executes an immutable tool call", async () => {
  const engine = createEngine(async (received) => {
    assert.equal(received.get("path"), "src/index.ts");
    return ok(ToolHandlerOutcome.success({ text: "owned" }));
  });
  const prepared = engine.prepare("call-1", "read_file", input());
  assert.ok(prepared.ok);
  const planned = await plan(engine, prepared.value);
  const executed = await engine.execute(planned, cancellation);
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
  const planned = await plan(engine, prepared.value);
  const failed = await engine.execute(planned, cancellation);
  assert.ok(failed.ok);
  assert.equal(failed.value.result.status, "failure");
  const denied = engine.deny(planned);
  assert.ok(denied.ok);
  assert.equal(denied.value.result.status, "failure");
});

test("records a prepared but uninvoked call without running its handler", () => {
  let handlerCalls = 0;
  const engine = createEngine(async () => {
    handlerCalls += 1;
    return ok(ToolHandlerOutcome.success({ text: "unreachable" }));
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
  const result = await thrown.execute(
    await plan(thrown, prepared.value),
    cancellation,
  );
  assert.ok(result.ok);
  assert.equal(result.value.result.status, "failure");
  assert.equal(result.value.contractFailure, true);

  const malformed = createEngine(
    async () => ({ ok: true } as unknown as ReturnType<ToolHandler> extends Promise<infer R> ? R : never),
  );
  const malformedCall = malformed.prepare("call-4", "read_file", input());
  assert.ok(malformedCall.ok);
  const malformedResult = await malformed.execute(
    await plan(malformed, malformedCall.value),
    cancellation,
  );
  assert.ok(malformedResult.ok);
  assert.equal(malformedResult.value.result.status, "failure");
  assert.equal(malformedResult.value.contractFailure, true);

  const rawOutput = createEngine(async () =>
    ok({ text: "legacy raw output" } as unknown as ToolHandlerOutcome),
  );
  const rawCall = rawOutput.prepare("call-raw", "read_file", input());
  assert.ok(rawCall.ok);
  const rawResult = await rawOutput.execute(
    await plan(rawOutput, rawCall.value),
    cancellation,
  );
  assert.ok(rawResult.ok);
  assert.equal(rawResult.value.result.status, "failure");
  assert.equal(rawResult.value.contractFailure, true);
});

test("preserves explicit failed-command output without a contract failure", async () => {
  const engine = createEngine(async () =>
    ok(
      ToolHandlerOutcome.failure({
        exitCode: 23,
        stderr: "owned stderr",
        stdout: "owned stdout",
      }),
    ),
  );
  const prepared = engine.prepare("call-command", "read_file", input());
  assert.ok(prepared.ok);

  const result = await engine.execute(
    await plan(engine, prepared.value),
    cancellation,
  );

  assert.ok(result.ok);
  assert.equal(result.value.result.status, "failure");
  assert.equal(result.value.contractFailure, false);
  assert.ok(result.value.result.output instanceof StructuredObject);
  assert.equal(result.value.result.output.get("exitCode"), 23);
  assert.equal(result.value.result.output.get("stderr"), "owned stderr");
  assert.equal(result.value.result.output.get("stdout"), "owned stdout");
});

test("rejects unknown tools, invalid inputs, and duplicate registrations", () => {
  const engine = createEngine(async () => ok(ToolHandlerOutcome.success({})));
  assert.equal(engine.prepare("call-5", "missing", input()).ok, false);
  assert.equal(
    engine.prepare("call-5", "read_file", { unexpected: true }).ok,
    false,
  );

  const descriptor = engine.descriptors.at(0);
  assert.ok(descriptor !== undefined);
  const duplicate = ToolRegistry.create([
    { descriptor, handler: async () => ok(ToolHandlerOutcome.success({})) },
    { descriptor, handler: async () => ok(ToolHandlerOutcome.success({})) },
  ]);
  assert.equal(duplicate.ok, false);

  const planner = async () => err(Object.freeze({ kind: "conflict" as const }));
  assert.deepEqual(
    ToolRegistry.create([{ descriptor, handler: async () => ok(ToolHandlerOutcome.success({})), planner }]),
    { ok: false, error: { kind: "invalidPlanner" } },
  );
  assert.deepEqual(
    ToolRegistry.create([{ descriptor, planner }]),
    { ok: false, error: { kind: "invalidPlanner" } },
  );
});

test("contains hostile descriptor, registry, prepared, and planned calls", async () => {
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

  const engine = createEngine(async () => ok(ToolHandlerOutcome.success({})));
  const revokedPrepared = Proxy.revocable({}, {});
  revokedPrepared.revoke();
  const hostilePrepared = revokedPrepared.proxy;
  assert.equal((await engine.plan(hostilePrepared as never, cancellation)).ok, false);
  assert.equal(engine.deny(hostilePrepared as never).ok, false);
  assert.equal(engine.notRun(hostilePrepared as never, "blocked").ok, false);
  const executed = await engine.execute(hostilePrepared as never, cancellation);
  assert.equal(executed.ok, false);
  if (!executed.ok) {
    assert.equal(executed.error.kind, "invalidPlannedCall");
    assert.equal("cause" in executed.error, false);
  }
});

test("plans one concrete effect only after pure call preparation", async () => {
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
    "Write one bounded workspace file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(descriptor.ok);
  let plannerCalls = 0;
  let effectCalls = 0;
  const registry = ToolRegistry.create([
    {
      descriptor: descriptor.value,
      planner: async () => {
        plannerCalls += 1;
        const effect = ToolEffectPlan.create(
          'path="src/index.ts" before="old" after="new"',
          async () => {
            effectCalls += 1;
            return ok(ToolHandlerOutcome.success({ changed: true }));
          },
        );
        assert.ok(effect.ok);
        return ok(effect.value);
      },
    },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);

  const prepared = engine.value.prepare("call-plan", "write_file", input());
  assert.ok(prepared.ok);
  assert.equal(plannerCalls, 0);
  const planned = await engine.value.plan(prepared.value, cancellation);
  assert.ok(planned.ok);
  assert.equal(plannerCalls, 1);
  assert.equal(planned.value.approvalRequired, true);
  assert.equal(
    planned.value.approvalPreview,
    'path="src/index.ts" before="old" after="new"',
  );
  const executed = await engine.value.execute(planned.value, cancellation);
  assert.ok(executed.ok);
  assert.equal(executed.value.result.status, "success");
  assert.equal(effectCalls, 1);
});

test("settles planning failures without approval or mutation", async () => {
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
    "Write one bounded workspace file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(descriptor.ok);
  const registry = ToolRegistry.create([
    {
      descriptor: descriptor.value,
      planner: async () => err(Object.freeze({ kind: "conflict" as const })),
    },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  const prepared = engine.value.prepare("call-conflict", "write_file", input());
  assert.ok(prepared.ok);
  const planned = await engine.value.plan(prepared.value, cancellation);
  assert.ok(planned.ok);
  assert.equal(planned.value.approvalRequired, false);
  assert.equal(planned.value.approvalPreview, "");
  const executed = await engine.value.execute(planned.value, cancellation);
  assert.ok(executed.ok);
  assert.equal(executed.value.result.status, "failure");
  assert.equal(executed.value.contractFailure, false);
});

test("contains thrown and malformed planner boundaries", async () => {
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
    "Write one bounded workspace file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(descriptor.ok);
  for (const planner of [
    async () => {
      throw new Error("private planner cause");
    },
    async () => ({ ok: true } as never),
    async () => ok({} as ToolEffectPlan),
  ]) {
    const registry = ToolRegistry.create([
      { descriptor: descriptor.value, planner },
    ]);
    assert.ok(registry.ok);
    const engine = ToolEngine.create(registry.value);
    assert.ok(engine.ok);
    const prepared = engine.value.prepare("call-hostile", "write_file", input());
    assert.ok(prepared.ok);
    const planned = await engine.value.plan(prepared.value, cancellation);
    assert.ok(planned.ok);
    assert.equal(planned.value.approvalRequired, false);
    assert.equal(planned.value.approvalPreview, "");
    const executed = await engine.value.execute(planned.value, cancellation);
    assert.ok(executed.ok);
    assert.equal(executed.value.result.status, "failure");
    assert.equal(executed.value.contractFailure, true);
  }
});

test("checkpoints invalid output as a generic post-invocation failure", async () => {
  const engine = createEngine(async () =>
    ok(ToolHandlerOutcome.success({ text: "x".repeat(262_145) })),
  );
  const prepared = engine.prepare("call-limit", "read_file", input());
  assert.ok(prepared.ok);

  const result = await engine.execute(
    await plan(engine, prepared.value),
    cancellation,
  );

  assert.ok(result.ok);
  assert.equal(result.value.result.status, "failure");
  assert.equal(result.value.contractFailure, true);
});

test("enforces one caller-owned output budget without losing attempted-call truth", async () => {
  let handlerCalls = 0;
  const engine = createEngine(async () => {
    handlerCalls += 1;
    return ok(ToolHandlerOutcome.success({ text: "x".repeat(64) }));
  });
  const prepared = engine.prepare("call-budget", "read_file", input());
  assert.ok(prepared.ok);

  const planned = await plan(engine, prepared.value);
  const invalid = await engine.execute(planned, cancellation, 22);
  assert.deepEqual(invalid, { ok: false, error: { kind: "invalidLimit" } });
  assert.equal(handlerCalls, 0);

  const bounded = await engine.execute(planned, cancellation, 23);
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

test("requires mutation approval fields to match the schema projection", () => {
  const text = StringSchema.create(1, 128);
  assert.ok(text.ok);
  const schema = ObjectSchema.create(
    [
      {
        description: "Relative workspace path.",
        name: "path",
        required: true,
        schema: text.value,
      },
    ],
    {
      fields: Object.freeze([
        Object.freeze({ mode: "exact" as const, name: "path" }),
      ]),
      maximumCodeUnits: TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits,
    },
  );
  assert.ok(schema.ok);

  const matching = ToolDescriptor.create(
    "write_file",
    "Write a file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(matching.ok);

  const mismatchedMode = ToolDescriptor.create(
    "write_file",
    "Write a file.",
    "write",
    schema.value,
    Object.freeze([
      Object.freeze({ mode: "size" as const, name: "path" }),
    ]),
  );
  assert.deepEqual(mismatchedMode, {
    ok: false,
    error: { kind: "invalidApproval" },
  });
});

test("escapes invisible and directional scalars in approval summaries", async () => {
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
    {
      descriptor: descriptor.value,
      handler: async () => ok(ToolHandlerOutcome.success({})),
    },
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
  const planned = await engine.value.plan(prepared.value, cancellation);
  assert.ok(planned.ok);
  assert.equal(planned.value.approvalPreview.includes("\u202E"), false);
  assert.equal(planned.value.approvalPreview.includes("\u200B"), false);
  assert.equal(planned.value.approvalPreview.includes("\\u{202e}"), true);
  assert.equal(planned.value.approvalPreview.includes("\\u{200b}"), true);
});
