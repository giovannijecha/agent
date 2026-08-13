import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  ComponentError,
  Fragment,
  RichRow,
  type Result,
  TextBlock,
  TUI_LIMITS,
  VerticalLayout,
  type VerticalSlot,
  Viewport,
  err,
  ok,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function block(text: string, anchor: "head" | "tail" = "head"): TextBlock {
  const result = TextBlock.create(text, anchor);
  assert.ok(result.ok);
  return result.value;
}

function slot(
  component: Component,
  minimumRows: number,
  preferredRows: number,
  priority: number,
  flex = 0,
): VerticalSlot {
  return Object.freeze({
    component,
    flex,
    minimumRows,
    preferredRows,
    priority,
  });
}

function layout(slots: readonly VerticalSlot[]): VerticalLayout {
  const result = VerticalLayout.create(slots);
  assert.ok(result.ok);
  return result.value;
}

class Fill implements Component {
  readonly #caret: boolean;
  readonly #text: string;

  constructor(text: string, caret = false) {
    this.#text = text;
    this.#caret = caret;
  }

  measure(): Result<Readonly<{ preferredRows: number }>, ComponentError> {
    return ok(Object.freeze({ preferredRows: 0 }));
  }

  render(size: Viewport): Result<Fragment, ComponentError> {
    const row = RichRow.fromText(this.#text);
    assert.ok(row.ok);
    return Fragment.create(
      size,
      Array.from({ length: size.rows }, () => row.value),
      this.#caret ? { row: 0, column: 0 } : undefined,
    );
  }
}

test("allocates minimum and preferred rows by priority in visual order", () => {
  const composed = layout([
    slot(block("header"), 0, 1, 0),
    slot(block("b1\nb2\nb3\nb4\nb5\nb6", "tail"), 1, 4, 1, 1),
    slot(block(">"), 1, 1, 2),
  ]);
  const regular = composed.render(viewport(8, 4));
  const tiny = composed.render(viewport(8, 1));

  assert.ok(regular.ok);
  assert.deepEqual(regular.value.rows.map((row) => row.text), ["b4", "b5", "b6", ">"]);
  assert.ok(tiny.ok);
  assert.deepEqual(tiny.value.rows.map((row) => row.text), [">"]);
});

test("plans exact component geometry through the canonical layout algorithm", () => {
  const composed = layout([
    slot(block("header"), 0, 1, 0),
    slot(block("one\ntwo\nthree"), 1, 3, 2, 1),
    slot(block(">"), 1, 1, 3),
  ]);
  const planned = composed.plan(viewport(8, 3));
  assert.ok(planned.ok);
  if (!planned.ok) return;
  const transcript = planned.value.allocation(1);
  const invalid = planned.value.allocation(3);
  const rendered = planned.value.render();

  assert.ok(transcript.ok);
  assert.deepEqual(transcript.value, {
    contentRows: 3,
    startRow: 0,
    viewportRows: 2,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidSlot");
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), ["one", "two", ">"]);
});

test("distributes remaining rows by deterministic flex weight", () => {
  const composed = layout([
    slot(new Fill("A"), 0, 0, 0, 1),
    slot(new Fill("B"), 0, 0, 0, 3),
  ]);
  const rendered = composed.render(viewport(2, 8));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), ["A", "A", "B", "B", "B", "B", "B", "B"]);
});

test("assigns indivisible flex remainders by quota then original-order ties", () => {
  const weighted = layout([
    slot(new Fill("A"), 0, 0, 0, 1),
    slot(new Fill("B"), 0, 0, 0, 2),
    slot(new Fill("C"), 0, 0, 0, 3),
  ]).render(viewport(2, 2));
  const tied = layout([
    slot(new Fill("A"), 0, 0, 0, 1),
    slot(new Fill("B"), 0, 0, 0, 1),
    slot(new Fill("C"), 0, 0, 0, 1),
  ]).render(viewport(2, 2));

  assert.ok(weighted.ok);
  assert.deepEqual(weighted.value.rows.map((row) => row.text), ["B", "C"]);
  assert.ok(tied.ok);
  assert.deepEqual(tied.value.rows.map((row) => row.text), ["A", "B"]);
});

test("uses original order to break equal-priority minimum ties", () => {
  const composed = layout([
    slot(new Fill("A"), 2, 2, 1),
    slot(new Fill("B"), 2, 2, 1),
  ]);
  const rendered = composed.render(viewport(2, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), ["A", "A", "B"]);
});

test("transforms one caret and rejects competing focused components", () => {
  const one = layout([
    slot(new Fill("A"), 1, 1, 1),
    slot(new Fill("B", true), 1, 1, 1),
  ]).render(viewport(2, 2));
  const many = layout([
    slot(new Fill("A", true), 1, 1, 1),
    slot(new Fill("B", true), 1, 1, 1),
  ]).render(viewport(2, 2));

  assert.ok(one.ok);
  assert.deepEqual(one.value.caret, { row: 1, column: 0 });
  assert.equal(many.ok, false);
  if (!many.ok) assert.equal(many.error.kind, "multipleCarets");
});

test("validates slot counts and values before retaining components", () => {
  const empty = VerticalLayout.create([]);
  const excessive = VerticalLayout.create(
    Array.from({ length: TUI_LIMITS.componentCount + 1 }, () =>
      slot(new Fill("x"), 0, 0, 0),
    ),
  );
  const invalid = VerticalLayout.create([
    slot(new Fill("x"), 2, 1, 0),
  ]);

  assert.equal(empty.ok, false);
  assert.equal(excessive.ok, false);
  assert.equal(invalid.ok, false);
  if (!empty.ok) assert.equal(empty.error.kind, "invalidComponentCount");
  if (!excessive.ok) {
    assert.equal(excessive.error.kind, "invalidComponentCount");
  }
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidSlot");
});

test("contains thrown callbacks and malformed component results", () => {
  const throws: Component = {
    measure(): never {
      throw new Error("private measure cause");
    },
    render(): never {
      throw new Error("private render cause");
    },
  };
  const badMeasurement: Component = {
    measure: () =>
      ok(Object.freeze({ preferredRows: -1 })) as Result<
        Readonly<{ preferredRows: number }>,
        ComponentError
      >,
    render: () => err(new ComponentError("invalidComponent", 0)),
  };
  const thrown = layout([slot(throws, 1, 1, 0)]).render(viewport(8, 1));
  const malformed = layout([
    slot(badMeasurement, 1, 1, 0),
  ]).render(viewport(8, 1));

  assert.equal(thrown.ok, false);
  assert.equal(malformed.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.error.kind, "unexpectedComponent");
    assert.equal("cause" in thrown.error, false);
  }
  if (!malformed.ok) {
    assert.equal(malformed.error.kind, "invalidMeasurement");
  }
});

test("revalidates returned fragments against the assigned viewport", () => {
  const wrong: Component = {
    measure: () => ok(Object.freeze({ preferredRows: 1 })),
    render: () => {
      const row = RichRow.fromText("too wide");
      assert.ok(row.ok);
      return Fragment.create(viewport(8, 1), [row.value]);
    },
  };
  const rendered = layout([slot(wrong, 1, 1, 0)]).render(viewport(4, 1));

  assert.equal(rendered.ok, false);
  if (!rendered.ok) assert.equal(rendered.error.kind, "lineTooWide");
});

test("preserves semantic tones while composing generic components", () => {
  const accent = TextBlock.create("agent", "head", "accent");
  const muted = TextBlock.create("ready", "head", "muted");
  assert.ok(accent.ok);
  assert.ok(muted.ok);
  const rendered = layout([
    slot(accent.value, 1, 1, 1),
    slot(muted.value, 1, 1, 1),
  ]).render(viewport(8, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.map((row) => row.spans.at(0)?.tone),
    ["accent", "muted"],
  );
});
