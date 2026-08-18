import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  InputArea,
  InteractionDock,
  SelectionList,
  TextBlock,
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

function editor() {
  const input = InputArea.create(
    Object.freeze({
      projectArea: () => Object.freeze({
        caretColumn: 5,
        caretRow: 0,
        rows: Object.freeze(["draft"]),
        selections: Object.freeze([
          Object.freeze({ end: 0, start: 0 }),
        ]),
      }),
    }),
    Object.freeze({ maximumRows: 6, textTone: "plain" as const }),
  );
  assert.ok(input.ok);
  return input.value;
}

test("owns one bounded editor focus and preserves its exact caret", () => {
  const dock = InteractionDock.create(editor(), {
    focus: "editor",
    maximumRows: 6,
  });
  assert.ok(dock.ok);
  assert.deepEqual(dock.value.measure(20), {
    ok: true,
    value: { preferredRows: 1 },
  });

  const rendered = dock.value.render(viewport(20, 3));
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((value) => value.text), [
    "draft",
    "",
    "",
  ]);
  assert.deepEqual(rendered.value.caret, { column: 5, row: 0 });
});

test("retains a one-row header and windows selection inside six rows", () => {
  const list = SelectionList.create(
    [
      row("item-1"),
      row("item-2"),
      row("item-3"),
      row("item-4"),
      row("item-5"),
      row("item-6"),
      row("item-7"),
      row("item-8"),
    ],
    7,
  );
  assert.ok(list.ok);
  const dock = InteractionDock.create(list.value, {
    focus: "selection",
    header: row("Models"),
    maximumRows: 6,
  });
  assert.ok(dock.ok);
  assert.deepEqual(dock.value.measure(20), {
    ok: true,
    value: { preferredRows: 6 },
  });

  const rendered = dock.value.render(viewport(20, 6));
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((value) => value.text), [
    "Models",
    "item-4",
    "item-5",
    "item-6",
    "item-7",
    "item-8",
  ]);
  assert.equal(rendered.value.rows.at(5)?.spans.at(0)?.tone, "accent");
  assert.equal(rendered.value.caret, undefined);
});

test("gives a one-row dock to the selection instead of its header", () => {
  const list = SelectionList.create(
    [row("one"), row("two"), row("three")],
    1,
  );
  assert.ok(list.ok);
  const dock = InteractionDock.create(list.value, {
    focus: "selection",
    header: row("Timeline"),
    maximumRows: 6,
  });
  assert.ok(dock.ok);

  const rendered = dock.value.render(viewport(12, 1));
  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "two");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.tone, "accent");
});

test("snapshots accessor-backed options exactly once before validation", () => {
  const reads = { focus: 0, header: 0, maximumRows: 0 };
  const once = <T>(property: keyof typeof reads, value: T): (() => T) =>
    () => {
      reads[property] += 1;
      if (reads[property] > 1) {
        throw new Error("private hostile content");
      }
      return value;
    };
  const options = Object.defineProperties({}, {
    focus: { get: once("focus", "editor") },
    header: { get: once("header", undefined) },
    maximumRows: { get: once("maximumRows", 6) },
  });

  const dock = InteractionDock.create(editor(), options as never);
  assert.ok(dock.ok);
  assert.deepEqual(reads, { focus: 1, header: 1, maximumRows: 1 });
  const rendered = dock.value.render(viewport(20, 1));
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.caret, { column: 5, row: 0 });
  assert.deepEqual(reads, { focus: 1, header: 1, maximumRows: 1 });
});

test("rejects invalid options, headers, and focus caret mismatches", () => {
  const list = SelectionList.create([row("one")], 0);
  const multirowHeader = TextBlock.create("one\ntwo", "head");
  assert.ok(list.ok);
  assert.ok(multirowHeader.ok);

  assert.equal(
    InteractionDock.create(list.value, {
      focus: "selection",
      maximumRows: 0,
    }).ok,
    false,
  );
  assert.equal(
    InteractionDock.create(list.value, {
      focus: "invalid" as "selection",
      maximumRows: 6,
    }).ok,
    false,
  );

  const badHeader = InteractionDock.create(list.value, {
    focus: "selection",
    header: multirowHeader.value,
    maximumRows: 6,
  });
  assert.ok(badHeader.ok);
  const measured = badHeader.value.measure(20);
  assert.equal(measured.ok, false);
  if (!measured.ok) assert.equal(measured.error.kind, "invalidMeasurement");

  const missingCaret = InteractionDock.create(list.value, {
    focus: "editor",
    maximumRows: 6,
  });
  assert.ok(missingCaret.ok);
  const missing = missingCaret.value.render(viewport(20, 1));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.kind, "invalidCaret");

  const unexpectedCaret = InteractionDock.create(editor(), {
    focus: "selection",
    maximumRows: 6,
  });
  assert.ok(unexpectedCaret.ok);
  const unexpected = unexpectedCaret.value.render(viewport(20, 1));
  assert.equal(unexpected.ok, false);
  if (!unexpected.ok) assert.equal(unexpected.error.kind, "invalidCaret");

  const hostile = Object.freeze({
    measure: () => {
      throw new Error("private hostile content");
    },
    render: () => {
      throw new Error("private hostile content");
    },
  }) as Component;
  const contained = InteractionDock.create(hostile, {
    focus: "selection",
    maximumRows: 6,
  });
  assert.ok(contained.ok);
  const hostileMeasurement = contained.value.measure(20);
  assert.equal(hostileMeasurement.ok, false);
  if (!hostileMeasurement.ok) {
    assert.equal(hostileMeasurement.error.kind, "unexpectedComponent");
  }
});
