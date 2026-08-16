import assert from "node:assert/strict";
import test from "node:test";

import {
  Conversation,
  ok,
} from "@agent/core";
import type {
  CancellationSignal,
  ModelStream,
  StreamingModel,
} from "@agent/runtime";
import type { ToolDescriptor } from "@agent/tools";

import {
  ProviderSession,
  type ProviderDefinition,
} from "../dist/provider-session.js";

type TestError = Readonly<{ kind: "test" }>;

class RecordingModel implements StreamingModel<TestError> {
  calls = 0;

  async open(
    _conversation: Conversation,
    _cancellation: CancellationSignal,
    _tools: readonly ToolDescriptor[],
  ) {
    this.calls += 1;
    return ok(
      Object.freeze({
        close: async () => ok(undefined),
        read: async () => ok(Object.freeze({ kind: "done" as const })),
      }) satisfies ModelStream<TestError>,
    );
  }
}

class Cancellation implements CancellationSignal {
  get requested(): boolean {
    return false;
  }

  whenRequested(): Promise<void> {
    return new Promise(() => undefined);
  }
}

function definition(
  id: "opencodeGo" | "opencodeZen",
  model: StreamingModel<TestError>,
): ProviderDefinition<TestError> {
  return Object.freeze({
    id,
    model,
    presentation: Object.freeze({
      authentication: "memory-only API key",
      displayName: id === "opencodeGo" ? "OpenCode Go" : "OpenCode Zen",
      model: id === "opencodeGo" ? "go-model" : "zen-model",
    }),
  });
}

test("provider session prefers Go and delegates only to the selected model", async () => {
  const go = new RecordingModel();
  const zen = new RecordingModel();
  const created = ProviderSession.create([
    definition("opencodeZen", zen),
    definition("opencodeGo", go),
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal(created.value.selected.id, "opencodeGo");
  const conversation = Conversation.empty();
  const cancellation = new Cancellation();
  await created.value.open(conversation, cancellation, []);
  assert.equal(go.calls, 1);
  assert.equal(zen.calls, 0);

  assert.deepEqual(created.value.select("opencodeZen"), ok(undefined));
  await created.value.open(conversation, cancellation, []);
  assert.equal(go.calls, 1);
  assert.equal(zen.calls, 1);
  assert.deepEqual(
    created.value.snapshots().map((entry) => [entry.id, entry.selected]),
    [
      ["opencodeZen", true],
      ["opencodeGo", false],
    ],
  );
});

test("provider session rejects empty, duplicate, and unavailable selections", () => {
  const model = new RecordingModel();
  const empty = ProviderSession.create<TestError>([]);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error.kind, "invalidProviderCount");

  const duplicate = ProviderSession.create([
    definition("opencodeGo", model),
    definition("opencodeGo", model),
  ]);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.kind, "duplicateProvider");

  const invalid = ProviderSession.create([
    definition("opencodeGo", model),
    {
      ...definition("opencodeZen", model),
      id: "unregisteredProvider",
    },
  ] as never);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidProvider");

  const created = ProviderSession.create([definition("opencodeGo", model)]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const unavailable = created.value.select("opencodeZen");
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.kind, "unknownProvider");
});
