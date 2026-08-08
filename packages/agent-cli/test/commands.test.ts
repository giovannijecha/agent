import assert from "node:assert/strict";
import test from "node:test";

import { executeSubmission } from "../dist/commands.js";

test("exposes the exact owned commands", () => {
  const help = executeSubmission("/help");

  assert.equal(help.kind, "notice");
  if (help.kind === "notice") {
    assert.deepEqual(help.lines, [
      "Commands",
      "/help       show this reference",
      "/providers  show integration availability",
      "/approve    allow the pending write or execute tool",
      "/deny       reject the pending write or execute tool",
      "/exit       close agent",
    ]);
    assert.equal(help.lines.join("\n").includes("/quit"), false);
  }
  assert.deepEqual(executeSubmission("/exit"), { kind: "exit" });
  assert.deepEqual(executeSubmission("/approve"), { kind: "approve" });
  assert.deepEqual(executeSubmission("/deny"), { kind: "deny" });
  assert.deepEqual(executeSubmission("   "), { kind: "none" });
});

test("never treats the rejected exit alias as a command", () => {
  const result = executeSubmission("/quit");

  assert.deepEqual(result, {
    kind: "notice",
    lines: ["Unknown command. Use /help."],
  });
});

test("reports integration status without creating an adapter", () => {
  const result = executeSubmission("/providers");

  assert.deepEqual(result, {
    kind: "notice",
    lines: [
      "No providers are enabled.",
      "Subscription integrations require owned authorization.",
    ],
  });
});

test("classifies ordinary text for transient runtime submission", () => {
  const privateText = "a personal request";
  const result = executeSubmission(privateText);

  assert.deepEqual(result, {
    kind: "submit",
    text: privateText,
  });
});
