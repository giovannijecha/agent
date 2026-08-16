import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMANDS,
  commandCompletions,
  executeSubmission,
} from "../dist/commands.js";

test("exposes the exact owned commands", () => {
  assert.deepEqual(executeSubmission("/exit"), { kind: "exit" });
  assert.deepEqual(executeSubmission("/permissions"), {
    kind: "permissions",
  });
  assert.equal(executeSubmission("/approve").kind, "notice");
  assert.equal(executeSubmission("/deny").kind, "notice");
  assert.deepEqual(executeSubmission("   "), { kind: "none" });
});

test("uses one canonical catalog for exact dispatch and completion", () => {
  assert.deepEqual(
    COMMANDS.map((definition) => definition.command),
    ["/providers", "/permissions", "/exit"],
  );
  assert.equal(executeSubmission("/providers").kind, "providers");
  assert.equal(executeSubmission("/permissions").kind, "permissions");
  assert.equal(executeSubmission("/exit").kind, "exit");
  assert.deepEqual(
    commandCompletions("/").map((definition) => definition.command),
    ["/providers", "/permissions", "/exit"],
  );
  assert.deepEqual(
    commandCompletions("/p").map((definition) => definition.command),
    ["/providers", "/permissions"],
  );
});

test("hides exact commands and rejects case, whitespace, and aliases", () => {
  assert.deepEqual(commandCompletions("/permissions"), []);
  assert.deepEqual(commandCompletions("/APP"), []);
  assert.deepEqual(commandCompletions(" /p"), []);
  assert.deepEqual(commandCompletions("/p "), []);
  assert.deepEqual(commandCompletions("/help"), []);
  assert.deepEqual(commandCompletions("/quit"), []);
});

test("never treats the rejected exit alias as a command", () => {
  const result = executeSubmission("/quit");

  assert.deepEqual(result, {
    kind: "notice",
    level: "warning",
    lines: ["Unknown command"],
  });
});

test("keeps documentation outside the command surface", () => {
  assert.deepEqual(executeSubmission("/help"), {
    kind: "notice",
    level: "warning",
    lines: ["Unknown command"],
  });
});

test("opens the canonical provider selector", () => {
  const result = executeSubmission("/providers");

  assert.deepEqual(result, { kind: "providers" });
});

test("classifies ordinary text for transient runtime submission", () => {
  const privateText = "a personal request";
  const result = executeSubmission(privateText);

  assert.deepEqual(result, {
    kind: "submit",
    text: privateText,
  });
});
