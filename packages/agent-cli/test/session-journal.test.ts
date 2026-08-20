import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { platform } from "node:process";
import test from "node:test";

import { ConversationTree, Message, Role } from "@agent/core";

import {
  resolveSessionJournalRoot,
  SessionJournal,
} from "../dist/session-journal.js";

function message(
  role: "assistant" | "user",
  content: string,
  reasoning?: string,
) {
  const created = Message.create(role, content, reasoning);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("message fixture failed");
  return created.value;
}

function oneTurn(reasoning?: string): ConversationTree {
  const appended = ConversationTree.empty().appendTurn(
    [
      message(Role.User, "question"),
      message(Role.Assistant, "answer", reasoning),
    ],
    "completed",
  );
  assert.equal(appended.ok, true);
  if (!appended.ok) throw new Error("tree fixture failed");
  return appended.value;
}

async function rewriteAsVersionOne(directory: string): Promise<void> {
  const journalPath = path.join(directory, "journal.jsonl");
  const lines = (await readFile(journalPath, { encoding: "utf8" }))
    .trimEnd()
    .split("\n");
  const header = JSON.parse(lines.at(0) ?? "null") as Record<string, unknown>;
  header.version = 1;
  const rewritten = [JSON.stringify(header)];
  for (let index = 1; index < lines.length; index += 1) {
    const stored = JSON.parse(lines.at(index) ?? "null") as {
      turn?: { entries?: Array<Record<string, unknown>> };
    };
    for (const entry of stored.turn?.entries ?? []) {
      delete entry.reasoning;
      const assistant = entry.assistant;
      if (assistant !== null && typeof assistant === "object") {
        delete (assistant as Record<string, unknown>).reasoning;
      }
    }
    rewritten.push(JSON.stringify(stored));
  }
  await writeFile(journalPath, rewritten.join("\n") + "\n", {
    encoding: "utf8",
    flag: "w",
  });
  const headPath = path.join(directory, "head.json");
  const head = JSON.parse(
    await readFile(headPath, { encoding: "utf8" }),
  ) as Record<string, unknown>;
  head.version = 1;
  await writeFile(headPath, JSON.stringify(head) + "\n", {
    encoding: "utf8",
    flag: "w",
  });
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
    const tree = oneTurn("settled reasoning");
    const appended = await created.value.journal.appendTurn(
      tree.turns.at(0)!,
      { kind: "completed" },
    );
    assert.equal(appended.ok, true);
    assert.equal((await created.value.journal.close()).ok, true);
    const originalDirectory = await sessionDirectory(root);
    const originalLines = (
      await readFile(path.join(originalDirectory, "journal.jsonl"), {
        encoding: "utf8",
      })
    ).trimEnd().split("\n");
    assert.equal(
      (JSON.parse(originalLines.at(0) ?? "null") as { version?: unknown })
        .version,
      2,
    );
    const originalTurn = JSON.parse(originalLines.at(1) ?? "null") as {
      turn?: { entries?: Array<Record<string, unknown>> };
    };
    const originalUser = originalTurn.turn?.entries?.at(0);
    assert.equal(
      originalUser !== undefined && "reasoning" in originalUser,
      false,
    );
    assert.equal(
      originalTurn.turn?.entries?.at(-1)?.reasoning,
      "settled reasoning",
    );

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.deepEqual(resumed.value.history.nodes, tree.nodes);
    assert.deepEqual(resumed.value.chat, {
      activeNodeId: 1,
      turns: [
        {
          assistant: "answer",
          reasoning: "settled reasoning",
          historyNodeId: 1,
          historyParentNodeId: 0,
          settlement: "completed",
          user: "question",
        },
      ],
    });
    assert.equal(resumed.value.recoveredState, false);
    assert.equal((await resumed.value.journal.close()).ok, true);
    assert.equal(
      (await SessionJournal.resumeLatest(root, "C:\\work\\other")).ok,
      false,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("resumes an exact version-one journal into a version-two continuation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-v1-migration-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
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
    const source = await sessionDirectory(root);
    await rewriteAsVersionOne(source);

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.deepEqual(resumed.value.history.nodes, tree.nodes);
    assert.equal((await resumed.value.journal.close()).ok, true);

    const sessions = await sessionDirectories(root);
    assert.equal(sessions.length, 2);
    const continuation = sessions.at(-1);
    assert.ok(continuation !== undefined);
    const journalLines = (
      await readFile(path.join(continuation, "journal.jsonl"), {
        encoding: "utf8",
      })
    ).trimEnd().split("\n");
    assert.equal(
      (JSON.parse(journalLines.at(0) ?? "null") as { version?: unknown })
        .version,
      2,
    );
    const migrated = JSON.parse(journalLines.at(1) ?? "null") as {
      turn?: { entries?: Array<Record<string, unknown>> };
    };
    const migratedUser = migrated.turn?.entries?.at(0);
    assert.equal(
      migratedUser !== undefined && "reasoning" in migratedUser,
      false,
    );
    assert.equal(migrated.turn?.entries?.at(-1)?.reasoning, null);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("recovers a synchronized turn whose head replacement was interrupted", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-head-gap-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const directory = await sessionDirectory(root);
    const headPath = path.join(directory, "head.json");
    const previousHead = await readFile(headPath, { encoding: "utf8" });
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
    await writeFile(headPath, previousHead, { encoding: "utf8", flag: "w" });

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.value.history.activeNodeId, 1);
    assert.equal(resumed.value.recoveredState, true);
    assert.equal((await resumed.value.journal.close()).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("preserves a deliberate head selection at the current journal revision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-selection-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const tree = oneTurn();
    assert.equal(
      (
        await created.value.journal.appendTurn(tree.turns.at(0)!, {
          kind: "completed",
        })
      ).ok,
      true,
    );
    assert.equal((await created.value.journal.select(0)).ok, true);
    assert.equal((await created.value.journal.close()).ok, true);

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.value.history.activeNodeId, 0);
    assert.equal(resumed.value.recoveredState, false);
    assert.equal((await resumed.value.journal.close()).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("fails closed when a POSIX head replacement cannot synchronize its directory", async () => {
  if (platform === "win32") return;
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-head-sync-"));
  let directory: string | undefined;
  try {
    const created = await SessionJournal.create(root, "/work/alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    directory = await sessionDirectory(root);
    await chmod(directory, 0o300);
    const selected = await created.value.journal.select(0);
    assert.equal(selected.ok, false);
    if (!selected.ok) assert.equal(selected.error.kind, "storage");
  } finally {
    if (directory !== undefined) await chmod(directory, 0o700);
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects an unreconciled head and journal revision gap", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-head-corrupt-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal((await created.value.journal.close()).ok, true);
    const directory = await sessionDirectory(root);
    const headPath = path.join(directory, "head.json");
    await writeFile(
      headPath,
      JSON.stringify({
        activeNodeId: 0,
        journalTurnCount: 2,
        kind: "head",
        version: 1,
      }) + "\n",
      { encoding: "utf8", flag: "w" },
    );

    const resumed = await SessionJournal.resumeLatest(root, "C:\\work\\alpha");
    assert.equal(resumed.ok, false);
    if (!resumed.ok) assert.equal(resumed.error.kind, "corrupt");
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
    assert.equal(resumed.value.recoveredState, true);
    assert.equal(resumed.value.history.activeNodeId, 1);
    assert.equal((await resumed.value.journal.close()).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("recovers a final journal line torn inside one UTF-8 scalar", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-utf8-tail-"));
  try {
    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
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
    const complete = await readFile(journalPath);
    const torn = new Uint8Array(complete.length + 3);
    torn.set(complete, 0);
    torn.set(Uint8Array.of(0x7b, 0xe2, 0x82), complete.length);
    await writeFile(journalPath, torn);

    const resumed = await SessionJournal.resumeLatest(
      root,
      "C:\\work\\alpha",
    );
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.value.recoveredState, true);
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
    const completeBytes = await readFile(journalPath);
    const invalidUtf8 = new Uint8Array(completeBytes.length + 2);
    invalidUtf8.set(completeBytes, 0);
    invalidUtf8.set(Uint8Array.of(0xff, 0x0a), completeBytes.length);
    await writeFile(journalPath, invalidUtf8);
    const invalid = await SessionJournal.resumeLatest(
      root,
      "C:\\work\\alpha",
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error.kind, "corrupt");

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

test("serializes concurrent admission at the exact workspace bound", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-admission-"));
  try {
    for (let index = 0; index < 31; index += 1) {
      const created = await SessionJournal.create(root, "C:\\work\\alpha");
      assert.equal(created.ok, true);
      if (!created.ok) return;
      assert.equal((await created.value.journal.close()).ok, true);
    }
    const admitted = await Promise.all([
      SessionJournal.create(root, "C:\\work\\alpha"),
      SessionJournal.create(root, "C:\\work\\alpha"),
    ]);
    const opened = admitted.filter((result) => result.ok);
    const blocked = admitted.filter((result) => !result.ok);
    assert.equal(opened.length <= 1, true);
    for (const rejected of blocked) {
      if (!rejected.ok) assert.equal(rejected.error.kind, "busy");
    }
    assert.equal((await sessionDirectories(root)).length, 31 + opened.length);
    for (const accepted of opened) {
      if (accepted.ok) {
        assert.equal((await accepted.value.journal.close()).ok, true);
      }
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("reclaims one unique stale admission without admitting two launchers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-admission-stale-"));
  try {
    const initial = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    assert.equal((await initial.value.journal.close()).ok, true);
    const workspace = path.dirname(await sessionDirectory(root));
    await writeFile(
      path.join(workspace, ".admission-999999999-" + "a".repeat(64)),
      "999999999\n",
      { encoding: "utf8", flag: "wx" },
    );

    const admitted = await Promise.all([
      SessionJournal.create(root, "C:\\work\\alpha"),
      SessionJournal.create(root, "C:\\work\\alpha"),
    ]);
    const opened = admitted.filter((result) => result.ok);
    assert.equal(opened.length <= 1, true);
    for (const result of admitted) {
      if (!result.ok) assert.equal(result.error.kind, "busy");
    }
    for (const result of opened) {
      if (result.ok) assert.equal((await result.value.journal.close()).ok, true);
    }
    assert.equal((await sessionDirectories(root)).length, 1 + opened.length);
    assert.equal(
      (await readdir(workspace, { withFileTypes: true })).some(
        (entry) => entry.name.startsWith(".admission-"),
      ),
      false,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("publishes after the latest retained creation value when the clock regresses", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-journal-order-"));
  try {
    const initial = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    assert.equal((await initial.value.journal.close()).ok, true);
    const directory = await sessionDirectory(root);
    const journalPath = path.join(directory, "journal.jsonl");
    const text = await readFile(journalPath, { encoding: "utf8" });
    const lines = text.split("\n");
    const firstLine = lines.at(0);
    assert.equal(firstLine === undefined, false);
    if (firstLine === undefined) return;
    const header = JSON.parse(firstLine) as {
      createdAt: number;
      sessionId: string;
    };
    const futureCreatedAt = Date.now() + 60_000;
    header.createdAt = futureCreatedAt;
    await writeFile(
      journalPath,
      JSON.stringify(header) + "\n" + lines.slice(1).join("\n"),
      { encoding: "utf8", flag: "w" },
    );
    const futureDirectory = path.join(
      path.dirname(directory),
      String(futureCreatedAt).padStart(13, "0") + "-" + header.sessionId,
    );
    await rename(directory, futureDirectory);

    const created = await SessionJournal.create(root, "C:\\work\\alpha");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal((await created.value.journal.close()).ok, true);
    const publications = (await sessionDirectories(root)).map((session) =>
      Number(path.basename(session).slice(0, 13))
    );
    assert.deepEqual(publications, [futureCreatedAt, futureCreatedAt + 1]);
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
