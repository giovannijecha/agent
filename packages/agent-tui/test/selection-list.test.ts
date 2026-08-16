import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  InlineText,
  SelectionList,
  TextBlock,
  TextSpan,
  TUI_LIMITS,
  type Result,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

function row(value: string): TextBlock {
  const created = TextBlock.create(value, "head");
  assert.ok(created.ok);
  return created.value;
}

test("measures a bounded one-row list and keeps the selection visible", () => {
  const list = SelectionList.create(
    [row("one"), row("two"), row("three"), row("four")],
    3,
  );
  assert.ok(list.ok);
  assert.deepEqual(list.value.measure(20), {
    ok: true,
    value: { preferredRows: 4 },
  });

  const rendered = list.value.render(viewport(20, 2));
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((value) => value.text), [
    "three",
    "four",
  ]);
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.tone, "plain");
  assert.equal(rendered.value.rows.at(1)?.spans.at(0)?.tone, "accent");
});

test("supports a one-row viewport around an interior selection", () => {
  const list = SelectionList.create(
    [row("one"), row("two"), row("three")],
    1,
  );
  assert.ok(list.ok);

  const rendered = list.value.render(viewport(8, 1));
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((value) => value.text), ["two"]);
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.tone, "accent");
});

test("accents only the selected row and preserves every other span property", () => {
  const resting = TextSpan.create("resting", "muted");
  const focused = TextSpan.create("focused", "attention", {
    mark: "selected",
    slant: "italic",
    surface: "subtle",
  }, {
    hyperlink: "https://example.com",
    position: Object.freeze({ document: 7, offset: 3 }),
  });
  assert.ok(resting.ok);
  assert.ok(focused.ok);
  const restingRow = InlineText.create([resting.value]);
  const focusedRow = InlineText.create([focused.value]);
  assert.ok(restingRow.ok);
  assert.ok(focusedRow.ok);
  const list = SelectionList.create(
    [restingRow.value, focusedRow.value],
    1,
  );
  assert.ok(list.ok);

  const rendered = list.value.render(viewport(20, 2));
  assert.ok(rendered.ok);
  const unselected = rendered.value.rows.at(0)?.spans.at(0);
  const selected = rendered.value.rows.at(1)?.spans.at(0);
  assert.equal(unselected?.tone, "muted");
  assert.equal(selected?.tone, "accent");
  assert.equal(selected?.mark, "selected");
  assert.equal(selected?.slant, "italic");
  assert.equal(selected?.surface, "subtle");
  assert.equal(selected?.hyperlink, "https://example.com");
  assert.deepEqual(selected?.position, { document: 7, offset: 3 });
});

test("rejects empty, oversized, invalid-selection, and multi-row lists", () => {
  const empty = SelectionList.create([], 0);
  const oversized = SelectionList.create(
    new Array<Component>(TUI_LIMITS.componentCount + 1),
    0,
  );
  const invalidSelection = SelectionList.create([row("one")], 1);
  const multiRow = TextBlock.create("one\ntwo", "head");
  assert.ok(multiRow.ok);
  const invalidRows = SelectionList.create([multiRow.value], 0);
  assert.ok(invalidRows.ok);

  assert.equal(empty.ok, false);
  assert.equal(oversized.ok, false);
  assert.equal(invalidSelection.ok, false);
  const measured = invalidRows.value.measure(20);
  assert.equal(measured.ok, false);
  if (!measured.ok) assert.equal(measured.error.kind, "invalidMeasurement");
});

test("contains hostile child access and measurement failures", () => {
  const hostile = Object.defineProperty({}, "measure", {
    get(): never {
      throw new Error("private getter escaped");
    },
  }) as Component;
  const rejected = SelectionList.create([hostile], 0);
  assert.equal(rejected.ok, false);

  const throwing = {
    measure(): never {
      throw new Error("private measurement escaped");
    },
    render(): Result<never, never> {
      throw new Error("render should not run");
    },
  } as Component;
  const contained = SelectionList.create([throwing], 0);
  assert.ok(contained.ok);
  const measured = contained.value.measure(20);
  assert.equal(measured.ok, false);
  if (!measured.ok) {
    assert.equal(measured.error.kind, "unexpectedComponent");
  }
});
