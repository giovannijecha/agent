import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  type ComponentMeasurement,
  Fragment,
  RichRow,
  type Result,
  ScrollState,
  ScrollView,
  TextBlock,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

function text(text: string, tone: "accent" | "plain" = "plain"): TextBlock {
  const created = TextBlock.create(text, "head", tone);
  assert.ok(created.ok);
  return created.value;
}

test("renders the followed end through one generic child", () => {
  const created = ScrollView.create(
    text("one\ntwo\nthree", "accent"),
    ScrollState.followEnd(),
  );
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(10, 2));
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), ["two", "three"]);
  assert.deepEqual(
    rendered.value.rows.map((row) => row.spans.at(0)?.tone),
    ["accent", "accent"],
  );
});

test("renders a manually selected window and pads short content", () => {
  const moved = ScrollState.followEnd().move(-1, 3, 2);
  assert.ok(moved.ok);
  const selected = ScrollView.create(text("one\ntwo\nthree"), moved.value);
  assert.ok(selected.ok);
  const selectedFrame = selected.value.render(viewport(10, 2));
  assert.ok(selectedFrame.ok);
  assert.deepEqual(selectedFrame.value.rows.map((row) => row.text), ["one", "two"]);

  const short = ScrollView.create(text("one"), ScrollState.followEnd());
  assert.ok(short.ok);
  const shortFrame = short.value.render(viewport(10, 3));
  assert.ok(shortFrame.ok);
  assert.deepEqual(shortFrame.value.rows.map((row) => row.text), ["one", "", ""]);
  assert.deepEqual(
    shortFrame.value.rows.map((row) => row.spans.at(0)?.tone),
    ["plain", undefined, undefined],
  );
});

class CaretComponent implements Component {
  measure(_columns: number): Result<ComponentMeasurement, never> {
    return Object.freeze({
      ok: true,
      value: Object.freeze({ preferredRows: 3 }),
    });
  }

  render(assigned: Viewport): Result<Fragment, never> {
    const rows = ["one", "two", "three"].map((text) => {
      const row = RichRow.fromText(text);
      assert.ok(row.ok);
      return row.value;
    });
    const fragment = Fragment.create(assigned, rows, { row: 2, column: 2 });
    assert.ok(fragment.ok);
    return fragment;
  }
}

test("translates a visible child caret and clips a hidden one", () => {
  const followed = ScrollView.create(
    new CaretComponent(),
    ScrollState.followEnd(),
  );
  assert.ok(followed.ok);
  const visible = followed.value.render(viewport(10, 2));
  assert.ok(visible.ok);
  assert.deepEqual(visible.value.caret, { row: 1, column: 2 });

  const started = ScrollState.followEnd().toStart(3, 2);
  assert.ok(started.ok);
  const clipped = ScrollView.create(new CaretComponent(), started.value);
  assert.ok(clipped.ok);
  const hidden = clipped.value.render(viewport(10, 2));
  assert.ok(hidden.ok);
  assert.equal(hidden.value.caret, undefined);
});

test("contains malformed child results at the shared component boundary", () => {
  const malformed = {
    measure(): unknown {
      return { ok: true, value: { preferredRows: 1 } };
    },
    render(): unknown {
      throw new Error("private callback cause");
    },
  } as unknown as Component;
  const created = ScrollView.create(malformed, ScrollState.followEnd());
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(10, 1));
  assert.equal(rendered.ok, false);
  if (!rendered.ok) assert.equal(rendered.error.kind, "unexpectedComponent");
});

test("rejects invalid measurement geometry before invoking the child", () => {
  let measured = false;
  const child = {
    measure(): Result<ComponentMeasurement, never> {
      measured = true;
      return Object.freeze({
        ok: true,
        value: Object.freeze({ preferredRows: 1 }),
      });
    },
    render(): never {
      throw new Error("not reached");
    },
  } satisfies Component;
  const created = ScrollView.create(child, ScrollState.followEnd());
  assert.ok(created.ok);

  const result = created.value.measure(0);

  assert.equal(result.ok, false);
  assert.equal(measured, false);
});
