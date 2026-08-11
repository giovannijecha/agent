import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  InputLine,
  type InputProjectionSource,
  Surface,
  TextBlock,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

test("paints one compact rectangular content surface without a border", () => {
  const text = TextBlock.create("short\na much longer line", "head", "plain");
  assert.ok(text.ok);
  const surface = Surface.create(text.value, {
    extent: "content",
    horizontalPadding: 1,
    slant: "italic",
    surface: "subtle",
  });
  assert.ok(surface.ok);

  assert.deepEqual(surface.value.measure(24), {
    ok: true,
    value: { preferredRows: 2 },
  });
  const rendered = surface.value.render(viewport(24, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    " short              ",
    " a much longer line ",
  ]);
  assert.equal(rendered.value.rows.every((row) => row.cellWidth === 20), true);
  assert.equal(
    rendered.value.rows.every((row) =>
      row.spans.every(
        (span) => span.slant === "italic" && span.surface === "subtle",
      ),
    ),
    true,
  );
});

test("can fill its viewport while preserving child tones", () => {
  const text = TextBlock.create("status", "head", "attention");
  assert.ok(text.ok);
  const surface = Surface.create(text.value, {
    extent: "viewport",
    horizontalPadding: 1,
    slant: "inherit",
    surface: "subtle",
  });
  assert.ok(surface.ok);

  const rendered = surface.value.render(viewport(12, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, " status     ");
  assert.equal(rendered.value.rows.at(0)?.cellWidth, 12);
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.tone, "attention");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.slant, "normal");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.surface, "subtle");
});

test("paints every closed semantic lifecycle surface", () => {
  for (const semantic of ["attention", "failure", "success"] as const) {
    const text = TextBlock.create("state", "head", "emphasis");
    assert.ok(text.ok);
    const surface = Surface.create(text.value, {
      extent: "viewport",
      horizontalPadding: 1,
      slant: "inherit",
      surface: semantic,
    });
    assert.ok(surface.ok);

    const rendered = surface.value.render(viewport(10, 1));

    assert.ok(rendered.ok);
    assert.equal(rendered.value.rows.at(0)?.text, " state    ");
    assert.equal(
      rendered.value.rows.at(0)?.spans.every((span) => span.surface === semantic),
      true,
    );
  }
});

test("drops optional padding but retains styling in a one-column viewport", () => {
  const text = TextBlock.create("a", "head", "plain");
  assert.ok(text.ok);
  const surface = Surface.create(text.value, {
    extent: "content",
    horizontalPadding: 1,
    slant: "italic",
    surface: "subtle",
  });
  assert.ok(surface.ok);

  const rendered = surface.value.render(viewport(1, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "a");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.slant, "italic");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.surface, "subtle");
});

test("paints one styled cell for an empty content surface", () => {
  const text = TextBlock.create("", "head", "plain");
  assert.ok(text.ok);
  const surface = Surface.create(text.value, {
    extent: "content",
    horizontalPadding: 0,
    slant: "inherit",
    surface: "inset",
  });
  assert.ok(surface.ok);

  const rendered = surface.value.render(viewport(8, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, " ");
  assert.equal(rendered.value.rows.at(0)?.cellWidth, 1);
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.surface, "inset");
});

test("translates a child caret through surface padding", () => {
  const source: InputProjectionSource = Object.freeze({
    project(): Readonly<{ caretColumn: number; text: string }> {
      return Object.freeze({ caretColumn: 2, text: "go" });
    },
  });
  const input = InputLine.create("", source, {
    prefixTone: "plain",
    textTone: "plain",
  });
  assert.ok(input.ok);
  const surface = Surface.create(input.value, {
    extent: "content",
    horizontalPadding: 1,
    slant: "inherit",
    surface: "subtle",
  });
  assert.ok(surface.ok);

  const rendered = surface.value.render(viewport(8, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, " go ");
  assert.deepEqual(rendered.value.caret, { row: 0, column: 3 });
});

test("contains hostile children and malformed style metadata", () => {
  const hostile: Component = Object.freeze({
    measure(): never {
      throw new Error("private measurement cause");
    },
    render(): never {
      throw new Error("private render cause");
    },
  });
  const surface = Surface.create(hostile, {
    extent: "content",
    horizontalPadding: 1,
    slant: "italic",
    surface: "subtle",
  });
  assert.ok(surface.ok);
  const measured = surface.value.measure(8);
  const rendered = surface.value.render(viewport(8, 1));
  const text = TextBlock.create("safe", "head", "plain");
  assert.ok(text.ok);
  const invalidPadding = Surface.create(text.value, {
    extent: "content",
    horizontalPadding: 2 as 1,
    slant: "italic",
    surface: "subtle",
  });
  const invalidStyle = Surface.create(text.value, {
    extent: "private" as "content",
    horizontalPadding: 1,
    slant: "italic",
    surface: "subtle",
  });

  assert.equal(measured.ok, false);
  assert.equal(rendered.ok, false);
  assert.equal(invalidPadding.ok, false);
  assert.equal(invalidStyle.ok, false);
  if (!measured.ok) assert.equal(measured.error.kind, "unexpectedComponent");
  if (!rendered.ok) assert.equal(rendered.error.kind, "unexpectedComponent");
  if (!invalidStyle.ok) assert.equal(invalidStyle.error.kind, "invalidStyle");
  assert.equal(JSON.stringify([measured, rendered]).includes("private"), false);
});
