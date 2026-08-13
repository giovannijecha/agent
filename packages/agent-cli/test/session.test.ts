import assert from "node:assert/strict";
import test from "node:test";

import { SessionController } from "../dist/session.js";

test("edits a draft and rejects removed command surfaces", () => {
  const session = new SessionController();
  const edited = session.feed("abc\u001B[D\u007F");
  const command = session.feed("\r/help\r");

  assert.equal(edited.redraw, true);
  assert.equal(session.draftLength, 0);
  assert.deepEqual(command.actions, [
    {
      kind: "submit",
      text: "ac",
    },
    { kind: "notice", level: "warning", lines: ["Unknown command"] },
  ]);
});

test("emits canonical exit and never treats slash quit as an alias", () => {
  const rejected = new SessionController().feed("/quit\r");
  const command = new SessionController().feed("/exit\rignored");

  assert.deepEqual(rejected.actions, [
    { kind: "notice", level: "warning", lines: ["Unknown command"] },
  ]);
  assert.deepEqual(command.actions, [{ kind: "exit" }]);
});

test("keeps interrupt distinct from EOF for application control policy", () => {
  const interrupt = new SessionController();
  interrupt.feed("draft");
  const interrupted = interrupt.feed("\u0003ignored");
  const eof = new SessionController().feed("\u0004ignored");

  assert.deepEqual(interrupted.actions, [{ kind: "interrupt" }]);
  assert.equal(interrupt.projectEditor(20).text, "draft");
  assert.deepEqual(eof.actions, [{ kind: "exit" }]);
});

test("emits ordered transcript navigation without touching the draft", () => {
  const session = new SessionController();
  session.feed("private draft");

  const navigated = session.feed(
    "\u001B[A\u001B[B\u001B[5~\u001B[6~",
  );

  assert.deepEqual(navigated, {
    actions: [
      { kind: "navigateTranscript", movement: "lineUp" },
      { kind: "navigateTranscript", movement: "lineDown" },
      { kind: "navigateTranscript", movement: "pageUp" },
      { kind: "navigateTranscript", movement: "pageDown" },
    ],
    redraw: false,
  });
  assert.equal(session.projectEditor(40).text, "private draft");
});

test("selects slash completions without navigating the transcript", () => {
  const session = new SessionController();
  const opened = session.feed("/");
  const moved = session.feed("\u001B[B\u001B[B\u001B[A");

  assert.equal(opened.redraw, true);
  assert.deepEqual(session.projectCommandCompletion(), {
    items: [
      {
        command: "/providers",
        description: "show integration availability",
      },
      {
        command: "/approve",
        description: "allow the pending tool call",
      },
      {
        command: "/deny",
        description: "reject the pending tool call",
      },
      { command: "/exit", description: "close agent" },
    ],
    selectedIndex: 1,
  });
  assert.deepEqual(moved, { actions: [], redraw: true });
});

test("bounds completion selection and completes with Tab without executing", () => {
  const session = new SessionController();
  session.feed("/");
  const bounded = session.feed("\u001B[A[B[B[B[B");

  assert.equal(bounded.redraw, true);
  assert.equal(session.projectCommandCompletion()?.selectedIndex, 3);
  const completed = session.feed("\t");
  assert.deepEqual(completed, { actions: [], redraw: true });
  assert.equal(session.projectEditor(20).text, "/exit");
  assert.equal(session.projectCommandCompletion(), undefined);

  const submitted = session.feed("\r");
  assert.deepEqual(submitted.actions, [{ kind: "exit" }]);
});

test("dispatches the selected slash completion with Enter", () => {
  const session = new SessionController();
  session.feed("/\u001B[B");

  const submitted = session.feed("\r");

  assert.deepEqual(submitted, {
    actions: [{ kind: "approve" }],
    redraw: true,
  });
  assert.equal(session.draftLength, 0);
  assert.equal(session.projectEditor(20).text, "");
  assert.equal(session.projectCommandCompletion(), undefined);
});

test("recomputes completion after editing and keeps unsupported Tab explicit", () => {
  const session = new SessionController();
  session.feed("/[B");
  assert.equal(session.projectCommandCompletion()?.selectedIndex, 1);

  session.feed("p");
  assert.deepEqual(session.projectCommandCompletion(), {
    items: [
      {
        command: "/providers",
        description: "show integration availability",
      },
    ],
    selectedIndex: 0,
  });
  assert.deepEqual(new SessionController().feed("\t"), {
    actions: [
      {
        kind: "notice",
        level: "warning",
        lines: ["Unsupported key sequence was ignored."],
      },
    ],
    redraw: true,
  });
});

test("preserves batched shutdown controls after an interrupt", () => {
  const controlExit = new SessionController();
  controlExit.feed("draft");
  const eof = controlExit.feed("\u0003\u0004");

  const commandExit = new SessionController();
  commandExit.feed("draft");
  const command = commandExit.feed("\u0003/exit\r");

  assert.deepEqual(eof.actions, [{ kind: "interrupt" }, { kind: "exit" }]);
  assert.deepEqual(command.actions, [
    { kind: "interrupt" },
    { kind: "exit" },
  ]);
  assert.equal(controlExit.projectEditor(20).text, "draft");
  assert.equal(commandExit.projectEditor(20).text, "draft");
});

test("surfaces ordinary text once and clears the editor", () => {
  const session = new SessionController();
  const update = session.feed("private request\r");

  assert.deepEqual(update.actions, [
    { kind: "submit", text: "private request" },
  ]);
  assert.equal(session.draftLength, 0);
  assert.equal(session.projectEditor(20).text, "");
});

test("keeps a multiline terminal paste atomic until an explicit Enter", () => {
  const session = new SessionController();

  const pasted = session.feed(
    "\u001B[200~first line\r\nsecond line\rthird line\u001B[201~",
  );

  assert.deepEqual(pasted.actions, []);
  assert.equal(
    session.projectEditorArea(40, 6).rows.join("\n"),
    "first line\nsecond line\nthird line",
  );

  const submitted = session.feed("\r");
  assert.deepEqual(submitted.actions, [
    {
      kind: "submit",
      text: "first line\nsecond line\nthird line",
    },
  ]);
});

test("applies word editing controls through the canonical composer path", () => {
  const session = new SessionController();
  session.feed("alpha beta");
  session.feed("\u001B[1;5DX");
  session.feed("\u001B[1;5C\u0008");

  assert.equal(session.projectEditor(40).text, "alpha ");
  assert.equal(session.draftLength, 6);
});

test("returns ordered actions from a multi-submission chunk", () => {
  const session = new SessionController();
  const update = session.feed("one\r/providers\r/exit\rafter");

  assert.deepEqual(update.actions, [
    { kind: "submit", text: "one" },
    {
      kind: "notice",
      level: "info",
      lines: ["No provider configured"],
    },
    { kind: "exit" },
  ]);
  assert.equal(session.draftLength, 0);
});

test("reports one configured provider without changing command ownership", () => {
  const session = new SessionController({
    authentication: "memory-only API key",
    displayName: "OpenCode Go",
    model: "kimi-k2.7-code",
  });

  assert.deepEqual(session.feed("/providers\r").actions, [
    {
      kind: "notice",
      level: "info",
      lines: ["OpenCode Go \u00b7 kimi-k2.7-code \u00b7 memory-only API key"],
    },
  ]);
});

test("turns terminal end into exit and discards incomplete decoder state", () => {
  const session = new SessionController();
  session.feed("\u001B[");

  const ended = session.end();

  assert.deepEqual(ended, { actions: [{ kind: "exit" }], redraw: false });
});
