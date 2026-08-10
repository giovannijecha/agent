import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  ComponentStack,
  type ComponentMeasurement,
  Fragment,
  InlineText,
  RichRow,
  type Result,
  TextBlock,
  TextSpan,
  TUI_LIMITS,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

function text(value: string): TextBlock {
  const created = TextBlock.create(value, "head");
  assert.ok(created.ok);
  return created.value;
}

function inline(): InlineText {
  const rail = TextSpan.create("| ", "muted");
  const name = TextSpan.create("read_file", "accent");
  const state = TextSpan.create("  running", "muted");
  assert.ok(rail.ok && name.ok && state.ok);
  const created = InlineText.create([rail.value, name.value, state.value]);
  assert.ok(created.ok);
  return created.value;
}

test("concatenates components with deterministic head and tail windows", () => {
  const components = [text("one\ntwo"), text("three")];
  const head = ComponentStack.create(components, "head");
  const tail = ComponentStack.create(components, "tail");
  assert.ok(head.ok && tail.ok);

  assert.deepEqual(head.value.measure(10), {
    ok: true,
    value: { preferredRows: 3 },
  });
  const headFrame = head.value.render(viewport(10, 2));
  const tailFrame = tail.value.render(viewport(10, 2));
  assert.ok(headFrame.ok && tailFrame.ok);
  assert.deepEqual(headFrame.value.rows.map((row) => row.text), ["one", "two"]);
  assert.deepEqual(tailFrame.value.rows.map((row) => row.text), ["two", "three"]);
});

test("pads opposite the anchor and preserves structured spans", () => {
  const head = ComponentStack.create([inline()], "head");
  const tail = ComponentStack.create([inline()], "tail");
  assert.ok(head.ok && tail.ok);

  const headFrame = head.value.render(viewport(30, 2));
  const tailFrame = tail.value.render(viewport(30, 2));
  assert.ok(headFrame.ok && tailFrame.ok);
  assert.deepEqual(headFrame.value.rows.map((row) => row.text), [
    "| read_file  running",
    "",
  ]);
  assert.deepEqual(tailFrame.value.rows.map((row) => row.text), [
    "",
    "| read_file  running",
  ]);
  assert.deepEqual(
    tailFrame.value.rows.at(1)?.spans.map((span) => span.tone),
    ["muted", "accent", "muted"],
  );
});

class FixedComponent implements Component {
  readonly #caret: Readonly<{ column: number; row: number }> | undefined;
  readonly #rows: readonly RichRow[];
  readonly #throwOnRender: boolean;

  constructor(
    values: readonly string[],
    caret?: Readonly<{ column: number; row: number }>,
    throwOnRender = false,
  ) {
    this.#rows = Object.freeze(
      values.map((value) => {
        const row = RichRow.fromText(value);
        assert.ok(row.ok);
        return row.value;
      }),
    );
    this.#caret = caret;
    this.#throwOnRender = throwOnRender;
  }

  measure(_columns: number): Result<ComponentMeasurement, never> {
    return Object.freeze({
      ok: true,
      value: Object.freeze({ preferredRows: this.#rows.length }),
    });
  }

  render(assigned: Viewport): Result<Fragment, never> {
    if (this.#throwOnRender) {
      throw new Error("invisible child rendered");
    }
    const created = Fragment.create(assigned, this.#rows, this.#caret);
    assert.ok(created.ok);
    return created;
  }
}

test("renders only children intersecting the selected window", () => {
  const stack = ComponentStack.create(
    [new FixedComponent(["old"], undefined, true), text("new")],
    "tail",
  );
  assert.ok(stack.ok);

  const rendered = stack.value.render(viewport(10, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "new");
});

test("translates one visible caret and rejects multiple visible carets", () => {
  const translated = ComponentStack.create(
    [new FixedComponent(["one"]), new FixedComponent(["two"], { row: 0, column: 2 })],
    "head",
  );
  assert.ok(translated.ok);
  const visible = translated.value.render(viewport(10, 2));
  assert.ok(visible.ok);
  assert.deepEqual(visible.value.caret, { row: 1, column: 2 });

  const multiple = ComponentStack.create(
    [
      new FixedComponent(["one"], { row: 0, column: 1 }),
      new FixedComponent(["two"], { row: 0, column: 1 }),
    ],
    "head",
  );
  assert.ok(multiple.ok);
  const rejected = multiple.value.render(viewport(10, 2));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.kind, "multipleCarets");
});

test("checks the component bound before reading array members", () => {
  const oversized = new Array<Component>(TUI_LIMITS.stackComponents + 1);
  Object.defineProperty(oversized, "0", {
    get(): never {
      throw new Error("member read escaped");
    },
  });

  const result = ComponentStack.create(oversized, "tail");

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "invalidComponentCount");
});

test("contains hostile component access during construction and rendering", () => {
  const hostile = Object.defineProperty({}, "measure", {
    get(): never {
      throw new Error("getter escaped");
    },
  }) as Component;
  const rejected = ComponentStack.create([hostile], "head");
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.kind, "invalidComponent");

  const malformed = {
    measure(): Result<ComponentMeasurement, never> {
      return Object.freeze({
        ok: true,
        value: Object.freeze({ preferredRows: 1 }),
      });
    },
    render(): unknown {
      return { ok: true, value: { rows: ["foreign"] } };
    },
  } as unknown as Component;
  const contained = ComponentStack.create([malformed], "head");
  assert.ok(contained.ok);
  const result = contained.value.render(viewport(10, 1));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "invalidComponent");

  const throwingMeasure = {
    measure(): never {
      throw new Error("measurement cause escaped");
    },
    render(): never {
      throw new Error("render should not run");
    },
  } as Component;
  const measured = ComponentStack.create([throwingMeasure], "head");
  assert.ok(measured.ok);
  const measurement = measured.value.measure(10);
  assert.equal(measurement.ok, false);
  if (!measurement.ok) {
    assert.equal(measurement.error.kind, "unexpectedComponent");
  }
});
