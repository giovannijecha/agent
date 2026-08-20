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

class Admission {
  activeValue = true;

  active(): boolean {
    return this.activeValue;
  }
}

class Catalog implements ProviderModelCatalog {
  readonly calls: Readonly<{ credential: string; provider: string }>[] = [];
  readonly #ids: readonly string[];

  constructor(ids: readonly string[] = Object.freeze([
    "qwen3-coder:480b-cloud",
    "glm-4.7:cloud",
  ])) {
    this.#ids = ids;
  }

  list(provider: "ollamaCloud", credential: string) {
    this.calls.push(Object.freeze({ credential, provider }));
    return Promise.resolve(ok(this.#ids));
  }
}

function definition(
  models: Readonly<Record<string, RecordingModel>>,
): ProviderDefinition<TestError> {
  return Object.freeze({
    acceptsModel: (id: string) => Object.hasOwn(models, id),
    createModel: (_credential: string, model: string) => models[model],
    id: "ollamaCloud" as const,
    presentation: Object.freeze({
      authentication: "owned credential",
      displayName: "Ollama Cloud",
    }),
  });
}

test("provider session admits, catalogs, and delegates after atomic pair selection", async () => {
  const selectedModel = new RecordingModel();
  const hiddenModel = new RecordingModel();
  const catalog = new Catalog();
  const created = ProviderSession.create(
    [definition({
      "glm-4.7:cloud": selectedModel,
      "hidden-local-model": hiddenModel,
      "qwen3-coder:480b-cloud": selectedModel,
    })],
    catalog,
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal(created.value.ready(), false);
  assert.deepEqual(created.value.snapshots(), [
    {
      configured: false,
      id: "ollamaCloud",
      presentation: {
        authentication: "owned credential",
        displayName: "Ollama Cloud",
        model: undefined,
      },
      ready: false,
      selected: false,
    },
  ]);
  assert.deepEqual(
    created.value.admit("ollamaCloud", "fixture-token", new Admission()),
    ok(undefined),
  );

  const listed = await created.value.listModels("ollamaCloud");
  assert.ok(listed.ok);
  if (!listed.ok) return;
  assert.deepEqual(listed.value, [
    { cost: "cloud", id: "qwen3-coder:480b-cloud", selected: false },
    { cost: "cloud", id: "glm-4.7:cloud", selected: false },
  ]);
  assert.deepEqual(
    created.value.selectProviderModel("ollamaCloud", "glm-4.7:cloud"),
    ok(undefined),
  );
  assert.equal(created.value.ready(), true);

  await created.value.open(
    Conversation.empty(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" }),
  );
  assert.equal(selectedModel.calls, 1);
  assert.equal(hiddenModel.calls, 0);
  assert.deepEqual(catalog.calls, [
    { credential: "fixture-token", provider: "ollamaCloud" },
  ]);

  created.value.clear();
  assert.equal(created.value.ready(), false);
  assert.equal(created.value.snapshots().at(0)?.configured, false);
});

test("provider session rejects invalid topology and selection order", async () => {
  const model = new RecordingModel();
  const catalog = new Catalog();
  const empty = ProviderSession.create<TestError>([], catalog);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error.kind, "invalidProviderCount");

  const duplicate = ProviderSession.create(
    [definition({ "qwen3-coder:480b-cloud": model }), definition({
      "qwen3-coder:480b-cloud": model,
    })],
    catalog,
  );
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.kind, "invalidProviderCount");

  const invalid = ProviderSession.create(
    [{ ...definition({ "qwen3-coder:480b-cloud": model }), id: "other" }] as never,
    catalog,
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidProvider");

  const created = ProviderSession.create(
    [definition({ "qwen3-coder:480b-cloud": model })],
    new Catalog(Object.freeze(["remote-only:cloud"])),
  );
  assert.ok(created.ok);
  if (!created.ok) return;
  const beforeAdmission = await created.value.listModels("ollamaCloud");
  assert.equal(beforeAdmission.ok, false);
  if (!beforeAdmission.ok && beforeAdmission.error.kind === "session") {
    assert.equal(beforeAdmission.error.error.kind, "providerNotConfigured");
  }
  assert.ok(
    created.value.admit(
      "ollamaCloud",
      "fixture-token",
      new Admission(),
    ).ok,
  );
  const unavailable = await created.value.listModels("ollamaCloud");
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.kind, "session");
});

test("provider session preserves the settled model when replacement creation fails", async () => {
  const retained = new RecordingModel();
  const created = ProviderSession.create<TestError>(
    [Object.freeze({
      acceptsModel: (id: string) =>
        id === "qwen3-coder:480b-cloud" || id === "glm-4.7:cloud",
      createModel: (_credential: string, model: string) =>
        model === "qwen3-coder:480b-cloud" ? retained : undefined,
      id: "ollamaCloud" as const,
      presentation: Object.freeze({
        authentication: "owned credential",
        displayName: "Ollama Cloud",
      }),
    })],
    new Catalog(),
  );
  assert.ok(created.ok);
  if (!created.ok) return;
  assert.ok(
    created.value.admit(
      "ollamaCloud",
      "fixture-token",
      new Admission(),
    ).ok,
  );
  assert.ok((await created.value.listModels("ollamaCloud")).ok);
  assert.ok(
    created.value.selectProviderModel(
      "ollamaCloud",
      "qwen3-coder:480b-cloud",
    ).ok,
  );

  const failed = created.value.selectProviderModel(
    "ollamaCloud",
    "glm-4.7:cloud",
  );
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.error.kind, "modelCreationFailed");
  assert.equal(
    created.value.snapshots().at(0)?.presentation.model,
    "qwen3-coder:480b-cloud",
  );
  assert.equal(created.value.snapshots().at(0)?.selected, true);
  await created.value.open(
    Conversation.empty(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" }),
  );
  assert.equal(retained.calls, 1);
});

test("provider session rejects hostile registration getters without retaining them", () => {
  const hostileCatalog = Object.defineProperty({}, "list", {
    get(): never {
      throw new Error("private catalog cause");
    },
  });
  const catalogResult = ProviderSession.create<TestError>(
    [definition({ "qwen3-coder:480b-cloud": new RecordingModel() })],
    hostileCatalog as ProviderModelCatalog,
  );
  assert.equal(catalogResult.ok, false);
  if (!catalogResult.ok) assert.equal(catalogResult.error.kind, "invalidProvider");

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
