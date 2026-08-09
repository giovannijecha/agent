import assert from "node:assert/strict";
import test from "node:test";

import { SessionController } from "../dist/session.js";

test("edits a draft and emits an exact command notice", () => {
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
    {
      kind: "notice",
      lines: [
        "Commands",
        "/help       show this reference",
        "/providers  show integration availability",
        "/approve    allow the pending write or execute tool",
        "/deny       reject the pending write or execute tool",
        "/exit       close agent",
      ],
    },
  ]);
});

test("emits canonical exit and never treats slash quit as an alias", () => {
  const rejected = new SessionController().feed("/quit\r");
  const command = new SessionController().feed("/exit\rignored");

  assert.deepEqual(rejected.actions, [
    { kind: "notice", lines: ["Unknown command. Use /help."] },
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

test("returns ordered actions from a multi-submission chunk", () => {
  const session = new SessionController();
  const update = session.feed("one\r/providers\r/exit\rafter");

  assert.deepEqual(update.actions, [
    { kind: "submit", text: "one" },
    {
      kind: "notice",
      lines: [
        "No providers are enabled.",
        "Subscription integrations require owned authorization.",
      ],
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
      lines: [
        "OpenCode Go is enabled.",
        "Model: kimi-k2.7-code.",
        "Authentication: memory-only API key.",
      ],
    },
  ]);
});

test("turns terminal end into exit and discards incomplete decoder state", () => {
  const session = new SessionController();
  session.feed("\u001B[");

  const ended = session.end();

  assert.deepEqual(ended, { actions: [{ kind: "exit" }], redraw: false });
});
