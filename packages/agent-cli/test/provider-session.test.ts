import assert from "node:assert/strict";
import test from "node:test";

import { Conversation, ok } from "@agent/core";
import type {
  CancellationSignal,
  ModelStream,
  StreamingModel,
} from "@agent/runtime";
import type { ToolDescriptor } from "@agent/tools";

import type { ProviderModelCatalog } from "../dist/provider-model-catalog.js";
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

class Catalog implements ProviderModelCatalog {
  readonly calls: string[] = [];
  readonly #ids: Readonly<Record<"opencodeGo" | "opencodeZen", readonly string[]>>;

  constructor(
    ids: Readonly<Record<"opencodeGo" | "opencodeZen", readonly string[]>> = {
      opencodeGo: Object.freeze(["go-current", "remote-only"]),
      opencodeZen: Object.freeze(["zen-free"]),
    },
  ) {
    this.#ids = ids;
  }

  list(provider: "opencodeGo" | "opencodeZen") {
    this.calls.push(provider);
    return Promise.resolve(ok(this.#ids[provider]));
  }
}

function definition(
  id: "opencodeGo" | "opencodeZen",
  models: Readonly<Record<string, RecordingModel>>,
): ProviderDefinition<TestError> {
  return Object.freeze({
    createModel: (_credential: string, model: string) => models[model],
    id,
    models: Object.freeze(
      Object.keys(models).map((model) =>
        Object.freeze({
          cost: model.endsWith("-free") ? "free" as const : "goPlan" as const,
          id: model,
        }),
      ),
    ),
    presentation: Object.freeze({
      authentication: "memory-only API key",
      displayName: id === "opencodeGo" ? "OpenCode Go" : "OpenCode Zen",
    }),
  });
}

test("provider session configures, catalogs, and delegates only after exact selection", async () => {
  const go = new RecordingModel();
  const zen = new RecordingModel();
  const catalog = new Catalog();
  const created = ProviderSession.create(
    [
      definition("opencodeZen", { "zen-free": zen }),
      definition("opencodeGo", { "go-current": go, "go-hidden": go }),
    ],
    catalog,
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal(created.value.ready(), false);
  assert.deepEqual(
    created.value.snapshots().map((entry) => [
      entry.id,
      entry.configured,
      entry.selected,
      entry.presentation.model,
    ]),
    [
      ["opencodeZen", false, false, undefined],
      ["opencodeGo", false, false, undefined],
    ],
  );
  assert.deepEqual(
    created.value.configure("opencodeGo", "go-key"),
    ok(undefined),
  );
  assert.equal(created.value.ready(), false);
  assert.deepEqual(created.value.select("opencodeGo"), ok(undefined));
  const listed = await created.value.listModels();
  assert.ok(listed.ok);
  if (!listed.ok) return;
  assert.deepEqual(listed.value, [
    { cost: "goPlan", id: "go-current", selected: false },
  ]);
  assert.deepEqual(created.value.selectModel("go-current"), ok(undefined));
  assert.equal(created.value.ready(), true);

  await created.value.open(Conversation.empty(), new Cancellation(), []);
  assert.equal(go.calls, 1);
  assert.equal(zen.calls, 0);
  assert.deepEqual(catalog.calls, ["opencodeGo"]);

  created.value.clear();
  assert.equal(created.value.ready(), false);
  assert.equal(created.value.snapshots().some((entry) => entry.configured), false);
});

test("provider session rejects invalid topology and selection order", async () => {
  const model = new RecordingModel();
  const catalog = new Catalog();
  const empty = ProviderSession.create<TestError>([], catalog);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error.kind, "invalidProviderCount");

  const duplicate = ProviderSession.create(
    [
      definition("opencodeGo", { "go-current": model }),
      definition("opencodeGo", { "go-current": model }),
    ],
    catalog,
  );
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.kind, "duplicateProvider");

  const invalid = ProviderSession.create(
    [
      definition("opencodeGo", { "go-current": model }),
      {
        ...definition("opencodeZen", { "zen-free": model }),
        id: "unregisteredProvider",
      },
    ] as never,
    catalog,
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidProvider");

  const created = ProviderSession.create(
    [definition("opencodeGo", { "go-current": model })],
    new Catalog({
      opencodeGo: Object.freeze(["remote-only"]),
      opencodeZen: Object.freeze([]),
    }),
  );
  assert.ok(created.ok);
  if (!created.ok) return;
  const beforeConfiguration = created.value.select("opencodeGo");
  assert.equal(beforeConfiguration.ok, false);
  if (!beforeConfiguration.ok) {
    assert.equal(beforeConfiguration.error.kind, "providerNotConfigured");
  }
  assert.ok(created.value.configure("opencodeGo", "go-key").ok);
  assert.ok(created.value.select("opencodeGo").ok);
  const unavailable = await created.value.listModels();
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.kind, "session");
});

test("provider session rejects hostile registration getters without retaining them", () => {
  const hostileCatalog = Object.defineProperty({}, "list", {
    get(): never {
      throw new Error("private catalog cause");
    },
  });
  const catalogResult = ProviderSession.create<TestError>(
    [definition("opencodeGo", { "go-current": new RecordingModel() })],
    hostileCatalog as ProviderModelCatalog,
  );
  assert.equal(catalogResult.ok, false);
  if (!catalogResult.ok) {
    assert.equal(catalogResult.error.kind, "invalidProvider");
  }

  const hostileDefinition = Object.defineProperty({}, "id", {
    get(): never {
      throw new Error("private definition cause");
    },
  });
  const definitionResult = ProviderSession.create<TestError>(
    [hostileDefinition as ProviderDefinition<TestError>],
    new Catalog(),
  );
  assert.equal(definitionResult.ok, false);
  if (!definitionResult.ok) {
    assert.equal(definitionResult.error.kind, "invalidProvider");
  }
});
