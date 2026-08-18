import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ConversationTree, Message, Role } from "@agent/core";

import {
  resolveSessionJournalRoot,
  SessionJournal,
} from "../dist/session-journal.js";

function message(role: "assistant" | "user", content: string) {
  const created = Message.create(role, content);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("message fixture failed");
  return created.value;
}

function oneTurn(): ConversationTree {
  const appended = ConversationTree.empty().appendTurn(
    [message(Role.User, "question"), message(Role.Assistant, "answer")],
    "completed",
  );
  assert.equal(appended.ok, true);
  if (!appended.ok) throw new Error("tree fixture failed");
  return appended.value;
}

async function sessionDirectory(stateRoot: string): Promise<string> {
  const sessions = await sessionDirectories(stateRoot);
  const session = sessions.at(0);
  assert.equal(session === undefined, false);
  return session ?? "missing";
}

async function sessionDirectories(stateRoot: string): Promise<string[]> {
  const workspaces = await readdir(stateRoot, { withFileTypes: true });
  const workspace = workspaces.find((entry) => entry.isDirectory());
  assert.equal(workspace === undefined, false);
  const workspacePath = path.join(
    stateRoot,
    workspace?.name ?? "missing",
  );
  const sessions = await readdir(
    workspacePath,
    { withFileTypes: true },
  );
  return sessions
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(workspacePath, entry.name))
    .sort();
}

test("creates and resumes the latest bounded journal for the exact workspace", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-test-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const tree = oneTurn();
    const appended = await created.value.journal.appendTurn(
      tree.turns.at(0)!,
      { kind: "completed" },
    );
    assert.equal(appended.ok, true);
    assert.equal((await created.value.journal.close()).ok, true);

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.deepEqual(resumed.value.history.nodes, tree.nodes);
    assert.deepEqual(resumed.value.chat, {
      activeNodeId: 1,
      turns: [
        {
          assistant: "answer",
          historyNodeId: 1,
          historyParentNodeId: 0,
          settlement: "completed",
          user: "question",
        },
      ],
    });
    assert.equal(resumed.value.recoveredPrefix, false);
    assert.equal((await resumed.value.journal.close()).ok, true);
    assert.equal(
      (await SessionJournal.resumeLatest(root, "C:\\work\\other")).ok,
      false,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects an active latest session and recovers only a truncated tail", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-tail-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(
      (await SessionJournal.resumeLatest(root, "C:\\work\\alpha")).ok,
      false,
    );
    const tree = oneTurn();
    assert.equal(
      (
        await created.value.journal.appendTurn(tree.turns.at(0)!, {
          kind: "completed",
        })
      ).ok,
      true,
    );
    assert.equal((await created.value.journal.close()).ok, true);
    const directory = await sessionDirectory(root);
    const journalPath = path.join(directory, "journal.jsonl");
    const text = await readFile(journalPath, { encoding: "utf8" });
    await writeFile(journalPath, text + "{\"kind\":", {
      encoding: "utf8",
      flag: "w",
    });

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.value.recoveredPrefix, true);
    assert.equal(resumed.value.history.activeNodeId, 1);
    assert.equal((await resumed.value.journal.close()).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects complete record corruption and unexpected workspace entries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-corrupt-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal((await created.value.journal.close()).ok, true);
    const directory = await sessionDirectory(root);
    const journalPath = path.join(directory, "journal.jsonl");
    const text = await readFile(journalPath, { encoding: "utf8" });
    await writeFile(journalPath, text + "{\"kind\":\"unknown\"}\n", {
      encoding: "utf8",
      flag: "w",
    });
    const corrupt = await SessionJournal.resumeLatest(
      root,
      "C:\\work\\alpha",
    );
    assert.equal(corrupt.ok, false);
    if (!corrupt.ok) assert.equal(corrupt.error.kind, "corrupt");

    await writeFile(journalPath, text, { encoding: "utf8", flag: "w" });
    const workspacePath = path.dirname(directory);
    await mkdir(path.join(workspacePath, ".creating-interrupted"));
    const unexpected = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(unexpected.ok, false);
    if (!unexpected.ok) assert.equal(unexpected.error.kind, "corrupt");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("retires oldest inactive sessions at the exact workspace bound", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-bound-"));
  try {
    for (let index = 0; index < 33; index += 1) {
      const created = await SessionJournal.create(root, "C:\\work\\alpha");
      assert.equal(created.ok, true);
      if (!created.ok) return;
      assert.equal((await created.value.journal.close()).ok, true);
    }
    assert.equal((await sessionDirectories(root)).length, 32);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("removes an exact stale process lock before continuing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-lock-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal((await created.value.journal.close()).ok, true);
    const directory = await sessionDirectory(root);
    await writeFile(path.join(directory, "lock"), "999999999\n", {
      encoding: "utf8",
      flag: "wx",
    });
    const resumed = await SessionJournal.resumeLatest(
      root,
      "C:\\work\\alpha",
    );
    assert.equal(resumed.ok, true);
    if (resumed.ok) {
      assert.equal((await resumed.value.journal.close()).ok, true);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("resolves only absolute platform-owned state bases", () => {
  assert.deepEqual(
    resolveSessionJournalRoot(
      "win32",
      { LOCALAPPDATA: "C:\\Users\\owner\\AppData\\Local" },
      "C:\\Users\\owner",
    ),
    {
      ok: true,
      value: "C:\\Users\\owner\\AppData\\Local\\agent\\sessions",
    },
  );
  assert.equal(
    resolveSessionJournalRoot("win32", {}, "C:\\Users\\owner").ok,
    false,
  );
  assert.equal(
    resolveSessionJournalRoot("linux", { XDG_STATE_HOME: "relative" }, "/home/owner")
      .ok,
    false,
  );
});
