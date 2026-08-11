import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMANDS,
  commandCompletions,
  executeSubmission,
} from "../dist/commands.js";

test("exposes the exact owned commands", () => {
  assert.deepEqual(executeSubmission("/exit"), { kind: "exit" });
  assert.deepEqual(executeSubmission("/approve"), { kind: "approve" });
  assert.deepEqual(executeSubmission("/deny"), { kind: "deny" });
  assert.deepEqual(executeSubmission("   "), { kind: "none" });
});

test("uses one canonical catalog for exact dispatch and completion", () => {
  assert.deepEqual(
    COMMANDS.map((definition) => definition.command),
    ["/providers", "/approve", "/deny", "/exit"],
  );
  assert.equal(executeSubmission("/providers").kind, "notice");
  assert.equal(executeSubmission("/approve").kind, "approve");
  assert.equal(executeSubmission("/deny").kind, "deny");
  assert.equal(executeSubmission("/exit").kind, "exit");
  assert.deepEqual(
    commandCompletions("/").map((definition) => definition.command),
    ["/providers", "/approve", "/deny", "/exit"],
  );
  assert.deepEqual(
    commandCompletions("/p").map((definition) => definition.command),
    ["/providers"],
  );
  assert.deepEqual(
    commandCompletions("/a").map((definition) => definition.command),
    ["/approve"],
  );
});

test("hides exact commands and rejects case, whitespace, and aliases", () => {
  assert.deepEqual(commandCompletions("/approve"), []);
  assert.deepEqual(commandCompletions("/APP"), []);
  assert.deepEqual(commandCompletions(" /a"), []);
  assert.deepEqual(commandCompletions("/a "), []);
  assert.deepEqual(commandCompletions("/help"), []);
  assert.deepEqual(commandCompletions("/quit"), []);
});

test("never treats the rejected exit alias as a command", () => {
  const result = executeSubmission("/quit");

  assert.deepEqual(result, {
    kind: "notice",
    lines: ["Unknown command."],
  });
});

test("keeps documentation outside the command surface", () => {
  assert.deepEqual(executeSubmission("/help"), {
    kind: "notice",
    lines: ["Unknown command."],
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
