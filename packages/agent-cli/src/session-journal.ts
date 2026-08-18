import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { hrtime, kill, pid } from "node:process";

import {
  ConversationTree,
  Message,
  ToolExchange,
  conversationJournalTurnFromUnknown,
  conversationJournalTurnRecord,
  err,
  ok,
  restoreConversationJournal,
  type ConversationJournalTurn,
  type ConversationTreeTurnSnapshot,
  type Result,
} from "@agent/core";

import type {
  RestoredChatState,
  RestoredChatTurn,
} from "./chat-state.js";
import {
  checkpointedFailureMarker,
  isTurnFailureCode,
} from "./turn-failure-presentation.js";
import { decodeUtf8Text, encodeUtf8Text } from "./utf8-text.js";

export const SESSION_JOURNAL_LIMITS = Object.freeze({
  journalBytes: 16_777_216,
  scannedSessions: 64,
  sessions: 32,
});

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const JOURNAL_VERSION = 1;
const SESSION_NAME = /^[0-9]{13}-[a-f0-9]{64}$/u;

export type SessionJournalErrorKind =
  | "active"
  | "corrupt"
  | "limit"
  | "missing"
  | "storage";

export class SessionJournalError {
  readonly #kind: SessionJournalErrorKind;

  constructor(kind: SessionJournalErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): SessionJournalErrorKind {
    return this.#kind;
  }
}

export type SessionTurnPresentation =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "completed" }>
  | Readonly<{ code: string; kind: "failed" }>;

export type OpenedSessionJournal = Readonly<{
  chat: RestoredChatState;
  history: ConversationTree;
  journal: SessionJournal;
  recoveredPrefix: boolean;
}>;

type SessionHeader = Readonly<{
  createdAt: number;
  kind: "session";
  resumedFrom: string | null;
  sessionId: string;
  version: 1;
  workspaceKey: string;
}>;

type StoredTurn = Readonly<{
  kind: "settledTurn";
  presentation: SessionTurnPresentation;
  turn: ReturnType<typeof conversationJournalTurnRecord>;
}>;

type LoadedSession = Readonly<{
  chat: RestoredChatState;
  header: SessionHeader;
  history: ConversationTree;
  presentations: readonly SessionTurnPresentation[];
  recoveredPrefix: boolean;
  turns: readonly ConversationJournalTurn[];
}>;

type SessionEntry = Readonly<{
  header: SessionHeader;
  path: string;
}>;

function failure(kind: SessionJournalErrorKind): SessionJournalError {
  return new SessionJournalError(kind);
}

function exactKeys(value: object, expected: string): boolean {
  return Object.keys(value).sort().join(",") === expected;
}

function causeCode(cause: unknown): string | undefined {
  if (cause === null || typeof cause !== "object") {
    return undefined;
  }
  try {
    const code = (cause as Readonly<{ code?: unknown }>).code;
    return typeof code === "string" ? code : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function workspaceKey(workspaceRoot: string): string {
  return createHash("sha256").update(workspaceRoot, "utf8").digest("hex");
}

function sessionIdentifier(
  key: string,
  createdAt: number,
  attempt: number,
): string {
  return createHash("sha256")
    .update(key, "utf8")
    .update("\u0000" + String(createdAt), "utf8")
    .update("\u0000" + String(pid), "utf8")
    .update("\u0000" + String(hrtime.bigint()), "utf8")
    .update("\u0000" + String(attempt), "utf8")
    .digest("hex");
}

async function ensureDirectory(directory: string): Promise<boolean> {
  try {
    await mkdir(directory, { mode: DIRECTORY_MODE, recursive: true });
    const observed = await lstat(directory);
    return observed.isDirectory() && !observed.isSymbolicLink();
  } catch (_cause: unknown) {
    return false;
  }
}

async function durableFile(
  file: string,
  text: string,
  flag: "a" | "wx",
): Promise<boolean> {
  const encoded = encodeUtf8Text(text);
  if (!encoded.ok) {
    return false;
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(file, flag, FILE_MODE);
    await handle.writeFile(encoded.value);
    await handle.sync();
    await handle.close();
    handle = undefined;
    return true;
  } catch (_cause: unknown) {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch (_closeCause: unknown) {
        // The single content-free storage failure remains authoritative.
      }
    }
    return false;
  }
}

async function readBoundedText(file: string): Promise<string | undefined> {
  try {
    const observed = await lstat(file);
    if (
      !observed.isFile() ||
      observed.isSymbolicLink() ||
      observed.size > SESSION_JOURNAL_LIMITS.journalBytes
    ) {
      return undefined;
    }
    const bytes = await readFile(file);
    const decoded = decodeUtf8Text(bytes);
    return decoded.ok ? decoded.value : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function parseHeader(input: unknown): SessionHeader | undefined {
  if (
    input === null ||
    typeof input !== "object" ||
    !exactKeys(
      input,
      "createdAt,kind,resumedFrom,sessionId,version,workspaceKey",
    )
  ) {
    return undefined;
  }
  const value = input as Readonly<{
    createdAt?: unknown;
    kind?: unknown;
    resumedFrom?: unknown;
    sessionId?: unknown;
    version?: unknown;
    workspaceKey?: unknown;
  }>;
  if (
    value.kind !== "session" ||
    value.version !== JOURNAL_VERSION ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.sessionId !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.sessionId) ||
    typeof value.workspaceKey !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.workspaceKey) ||
    (value.resumedFrom !== null &&
      (typeof value.resumedFrom !== "string" ||
        !/^[a-f0-9]{64}$/u.test(value.resumedFrom)))
  ) {
    return undefined;
  }
  return Object.freeze({
    createdAt: value.createdAt,
    kind: "session" as const,
    resumedFrom: value.resumedFrom,
    sessionId: value.sessionId,
    version: JOURNAL_VERSION,
    workspaceKey: value.workspaceKey,
  });
}

function parsePresentation(input: unknown): SessionTurnPresentation | undefined {
  if (input === null || typeof input !== "object") {
    return undefined;
  }
  const value = input as Readonly<{ code?: unknown; kind?: unknown }>;
  if (
    (value.kind === "completed" || value.kind === "cancelled") &&
    exactKeys(input, "kind")
  ) {
    return Object.freeze({ kind: value.kind });
  }
  if (
    value.kind === "failed" &&
    exactKeys(input, "code,kind") &&
    isTurnFailureCode(value.code)
  ) {
    return Object.freeze({ code: value.code, kind: "failed" as const });
  }
  return undefined;
}

function parseStoredTurn(input: unknown): Readonly<{
  presentation: SessionTurnPresentation;
  turn: ConversationJournalTurn;
}> | undefined {
  if (
    input === null ||
    typeof input !== "object" ||
    !exactKeys(input, "kind,presentation,turn")
  ) {
    return undefined;
  }
  const value = input as Readonly<{
    kind?: unknown;
    presentation?: unknown;
    turn?: unknown;
  }>;
  if (value.kind !== "settledTurn") {
    return undefined;
  }
  const presentation = parsePresentation(value.presentation);
  const turn = conversationJournalTurnFromUnknown(value.turn);
  if (
    presentation === undefined ||
    !turn.ok ||
    (turn.value.settlement === "completed") !==
      (presentation.kind === "completed")
  ) {
    return undefined;
  }
  return Object.freeze({ presentation, turn: turn.value });
}

function parseHead(input: unknown): number | undefined {
  if (
    input === null ||
    typeof input !== "object" ||
    !exactKeys(input, "activeNodeId,kind,version")
  ) {
    return undefined;
  }
  const value = input as Readonly<{
    activeNodeId?: unknown;
    kind?: unknown;
    version?: unknown;
  }>;
  return value.kind === "head" &&
      value.version === JOURNAL_VERSION &&
      typeof value.activeNodeId === "number" &&
      Number.isSafeInteger(value.activeNodeId) &&
      value.activeNodeId >= 0
    ? value.activeNodeId
    : undefined;
}

function displayTurn(
  turn: ConversationJournalTurn,
  presentation: SessionTurnPresentation,
): RestoredChatTurn | undefined {
  const user = turn.entries.at(0);
  if (!(user instanceof Message) || user.role !== "user") {
    return undefined;
  }
  const segments: string[] = [];
  for (const entry of turn.entries) {
    if (entry instanceof ToolExchange) {
      const assistant = entry.assistant?.content;
      if (assistant !== undefined && assistant.trim().length > 0) {
        segments.push(assistant);
      }
    }
  }
  if (presentation.kind === "completed") {
    const assistant = turn.entries.at(-1);
    if (!(assistant instanceof Message) || assistant.role !== "assistant") {
      return undefined;
    }
    segments.push(assistant.content);
  } else if (presentation.kind === "cancelled") {
    segments.push("[turn cancelled after tool activity]");
  } else {
    const marker = checkpointedFailureMarker(presentation.code);
    if (marker === undefined) {
      return undefined;
    }
    segments.push(marker);
  }
  const assistant = segments.join("\n\n");
  return assistant.trim().length === 0
    ? undefined
    : Object.freeze({
        assistant,
        historyNodeId: turn.id,
        historyParentNodeId: turn.parentId,
        settlement: turn.settlement,
        user: user.content,
      });
}

async function loadSession(
  sessionPath: string,
  expectedWorkspaceKey: string,
): Promise<LoadedSession | undefined> {
  const journalText = await readBoundedText(path.join(sessionPath, "journal.jsonl"));
  const headText = await readBoundedText(path.join(sessionPath, "head.json"));
  if (journalText === undefined || headText === undefined) {
    return undefined;
  }
  const completeTail = journalText.endsWith("\n");
  const lines = journalText.split("\n");
  let recoveredPrefix = false;
  if (!completeTail) {
    const tail = lines.pop();
    recoveredPrefix = tail !== undefined && tail.length > 0;
  } else {
    lines.pop();
  }
  const headerLine = lines.at(0);
  if (headerLine === undefined || headerLine.length === 0) {
    return undefined;
  }
  let headerUnknown: unknown;
  try {
    headerUnknown = JSON.parse(headerLine);
  } catch (_cause: unknown) {
    return undefined;
  }
  const header = parseHeader(headerUnknown);
  if (header === undefined || header.workspaceKey !== expectedWorkspaceKey) {
    return undefined;
  }
  const turns: ConversationJournalTurn[] = [];
  const presentations: SessionTurnPresentation[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines.at(index);
    if (line === undefined || line.length === 0) {
      return undefined;
    }
    let unknown: unknown;
    try {
      unknown = JSON.parse(line);
    } catch (_cause: unknown) {
      return undefined;
    }
    const stored = parseStoredTurn(unknown);
    if (stored === undefined) {
      return undefined;
    }
    turns.push(stored.turn);
    presentations.push(stored.presentation);
  }
  let headUnknown: unknown;
  try {
    headUnknown = JSON.parse(headText);
  } catch (_cause: unknown) {
    return undefined;
  }
  const activeNodeId = parseHead(headUnknown);
  if (activeNodeId === undefined) {
    return undefined;
  }
  const restored = restoreConversationJournal(turns, activeNodeId);
  if (!restored.ok) {
    return undefined;
  }
  const chatTurns: RestoredChatTurn[] = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns.at(index);
    const presentation = presentations.at(index);
    if (turn === undefined || presentation === undefined) {
      return undefined;
    }
    const displayed = displayTurn(turn, presentation);
    if (displayed === undefined) {
      return undefined;
    }
    chatTurns.push(displayed);
  }
  return Object.freeze({
    chat: Object.freeze({
      activeNodeId,
      turns: Object.freeze(chatTurns),
    }),
    header,
    history: restored.value,
    presentations: Object.freeze(presentations),
    recoveredPrefix,
    turns: Object.freeze(turns),
  });
}

async function sessionLocked(sessionPath: string): Promise<"active" | "free" | "invalid"> {
  const lockPath = path.join(sessionPath, "lock");
  let text: string;
  try {
    const bytes = await readFile(lockPath);
    const decoded = decodeUtf8Text(bytes, true);
    if (!decoded.ok) {
      return "invalid";
    }
    text = decoded.value;
  } catch (cause: unknown) {
    return causeCode(cause) === "ENOENT" ? "free" : "invalid";
  }
  if (!/^[1-9][0-9]{0,9}\n$/u.test(text)) {
    return "invalid";
  }
  const owner = Number(text.trim());
  try {
    kill(owner, 0);
    return "active";
  } catch (cause: unknown) {
    if (causeCode(cause) !== "ESRCH") {
      return "active";
    }
  }
  try {
    await rm(lockPath, { force: true, recursive: false });
    return "free";
  } catch (_cause: unknown) {
    return "invalid";
  }
}

async function scanSessions(
  workspaceDirectory: string,
  expectedWorkspaceKey: string,
): Promise<SessionEntry[] | undefined> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(workspaceDirectory, { withFileTypes: true });
  } catch (_cause: unknown) {
    return undefined;
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SESSION_NAME.test(entry.name)) {
      return undefined;
    }
    names.push(entry.name);
  }
  if (names.length > SESSION_JOURNAL_LIMITS.scannedSessions) {
    return undefined;
  }
  const sessions: SessionEntry[] = [];
  for (const name of names) {
    const sessionPath = path.join(workspaceDirectory, name);
    const text = await readBoundedText(path.join(sessionPath, "journal.jsonl"));
    const firstLine = text?.split("\n").at(0);
    if (firstLine === undefined) {
      return undefined;
    }
    let unknown: unknown;
    try {
      unknown = JSON.parse(firstLine);
    } catch (_cause: unknown) {
      return undefined;
    }
    const header = parseHeader(unknown);
    if (
      header === undefined ||
      header.workspaceKey !== expectedWorkspaceKey ||
      name !== String(header.createdAt).padStart(13, "0") + "-" + header.sessionId
    ) {
      return undefined;
    }
    sessions.push(Object.freeze({ header, path: sessionPath }));
  }
  sessions.sort((left, right) =>
    left.header.createdAt === right.header.createdAt
      ? left.header.sessionId.localeCompare(right.header.sessionId)
      : left.header.createdAt - right.header.createdAt
  );
  return sessions;
}

async function removeOldSessions(
  sessions: readonly SessionEntry[],
  removeCount: number,
  workspaceDirectory: string,
): Promise<boolean> {
  let removed = 0;
  for (const session of sessions) {
    if (removed >= removeCount) {
      break;
    }
    const relative = path.relative(workspaceDirectory, session.path);
    if (
      relative.length === 0 ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      return false;
    }
    const lock = await sessionLocked(session.path);
    if (lock === "invalid") {
      return false;
    }
    if (lock === "active") {
      continue;
    }
    try {
      await rm(session.path, { force: true, recursive: true });
      removed += 1;
    } catch (_cause: unknown) {
      return false;
    }
  }
  return removed === removeCount;
}

function storedTurn(
  turn: ConversationTreeTurnSnapshot,
  presentation: SessionTurnPresentation,
): StoredTurn | undefined {
  if (
    (turn.settlement === "completed") !==
      (presentation.kind === "completed") ||
    (presentation.kind === "failed" &&
      !isTurnFailureCode(presentation.code))
  ) {
    return undefined;
  }
  return Object.freeze({
    kind: "settledTurn" as const,
    presentation,
    turn: conversationJournalTurnRecord(turn),
  });
}

function headText(activeNodeId: number): string {
  return JSON.stringify({
    activeNodeId,
    kind: "head",
    version: JOURNAL_VERSION,
  }) + "\n";
}

/** Resolves the private per-user state root without using the workspace. */
export function resolveSessionJournalRoot(
  platform: string,
  environment: Readonly<{
    LOCALAPPDATA?: string;
    XDG_STATE_HOME?: string;
  }>,
  homeDirectory: string,
): Result<string, SessionJournalError> {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const base = platform === "win32"
    ? environment.LOCALAPPDATA
    : environment.XDG_STATE_HOME ??
      pathApi.join(homeDirectory, ".local", "state");
  if (
    typeof base !== "string" ||
    base.trim().length === 0 ||
    !pathApi.isAbsolute(base)
  ) {
    return err(failure("storage"));
  }
  return ok(pathApi.join(pathApi.resolve(base), "agent", "sessions"));
}

/** CLI-owned append-only journal plus replaceable active-node pointer. */
export class SessionJournal {
  readonly #journalPath: string;
  readonly #lockPath: string;
  readonly #sessionPath: string;
  #closed = false;
  #headRevision = 0;
  #turnCount: number;

  private constructor(
    sessionPath: string,
    turnCount: number,
  ) {
    this.#sessionPath = sessionPath;
    this.#journalPath = path.join(sessionPath, "journal.jsonl");
    this.#lockPath = path.join(sessionPath, "lock");
    this.#turnCount = turnCount;
  }

  static async create(
    stateRoot: string,
    workspaceRoot: string,
  ): Promise<Result<OpenedSessionJournal, SessionJournalError>> {
    return this.#create(stateRoot, workspaceRoot);
  }

  static async resumeLatest(
    stateRoot: string,
    workspaceRoot: string,
  ): Promise<Result<OpenedSessionJournal, SessionJournalError>> {
    const key = workspaceKey(workspaceRoot);
    const workspaceDirectory = path.join(stateRoot, key);
    if (!(await ensureDirectory(workspaceDirectory))) {
      return err(failure("storage"));
    }
    const sessions = await scanSessions(workspaceDirectory, key);
    const latest = sessions?.at(-1);
    if (sessions === undefined) {
      return err(failure("corrupt"));
    }
    if (latest === undefined) {
      return err(failure("missing"));
    }
    const lock = await sessionLocked(latest.path);
    if (lock === "active") {
      return err(failure("active"));
    }
    if (lock === "invalid") {
      return err(failure("corrupt"));
    }
    const loaded = await loadSession(latest.path, key);
    if (loaded === undefined) {
      return err(failure("corrupt"));
    }
    return this.#create(
      stateRoot,
      workspaceRoot,
      loaded,
      loaded.header.sessionId,
    );
  }

  static async #create(
    stateRoot: string,
    workspaceRoot: string,
    seed?: LoadedSession,
    resumedFrom: string | null = null,
  ): Promise<Result<OpenedSessionJournal, SessionJournalError>> {
    const key = workspaceKey(workspaceRoot);
    const workspaceDirectory = path.join(stateRoot, key);
    if (!(await ensureDirectory(workspaceDirectory))) {
      return err(failure("storage"));
    }
    const sessions = await scanSessions(workspaceDirectory, key);
    if (sessions === undefined) {
      return err(failure("corrupt"));
    }
    const removeCount = Math.max(
      0,
      sessions.length - SESSION_JOURNAL_LIMITS.sessions + 1,
    );
    if (
      removeCount > 0 &&
      !(await removeOldSessions(sessions, removeCount, workspaceDirectory))
    ) {
      return err(failure("limit"));
    }
    const createdAt = Date.now();
    let temporaryPath: string | undefined;
    let finalPath: string | undefined;
    let header: SessionHeader | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const sessionId = sessionIdentifier(key, createdAt, attempt);
      const name = String(createdAt).padStart(13, "0") + "-" + sessionId;
      const temporary = path.join(workspaceDirectory, ".creating-" + name);
      try {
        await mkdir(temporary, { mode: DIRECTORY_MODE, recursive: false });
        temporaryPath = temporary;
        finalPath = path.join(workspaceDirectory, name);
        header = Object.freeze({
          createdAt,
          kind: "session" as const,
          resumedFrom,
          sessionId,
          version: JOURNAL_VERSION,
          workspaceKey: key,
        });
        break;
      } catch (_cause: unknown) {
        // A bounded new identity attempt is the only collision handling.
      }
    }
    if (
      temporaryPath === undefined ||
      finalPath === undefined ||
      header === undefined
    ) {
      return err(failure("storage"));
    }
    const turns = seed?.turns ?? Object.freeze([]);
    const presentations = seed?.presentations ?? Object.freeze([]);
    const activeNodeId = seed?.history.activeNodeId ?? 0;
    let journalText = JSON.stringify(header) + "\n";
    for (let index = 0; index < turns.length; index += 1) {
      const turn = seed?.history.turns.at(index);
      const presentation = presentations.at(index);
      if (turn === undefined || presentation === undefined) {
        await rm(temporaryPath, { force: true, recursive: true });
        return err(failure("corrupt"));
      }
      const stored = storedTurn(turn, presentation);
      if (stored === undefined) {
        await rm(temporaryPath, { force: true, recursive: true });
        return err(failure("corrupt"));
      }
      journalText += JSON.stringify(stored) + "\n";
    }
    const encoded = encodeUtf8Text(journalText);
    if (
      !encoded.ok ||
      encoded.value.length > SESSION_JOURNAL_LIMITS.journalBytes ||
      !(await durableFile(
        path.join(temporaryPath, "journal.jsonl"),
        journalText,
        "wx",
      )) ||
      !(await durableFile(
        path.join(temporaryPath, "head.json"),
        headText(activeNodeId),
        "wx",
      )) ||
      !(await durableFile(
        path.join(temporaryPath, "lock"),
        String(pid) + "\n",
        "wx",
      ))
    ) {
      await rm(temporaryPath, { force: true, recursive: true });
      return err(failure("storage"));
    }
    try {
      await rename(temporaryPath, finalPath);
    } catch (_cause: unknown) {
      await rm(temporaryPath, { force: true, recursive: true });
      return err(failure("storage"));
    }
    const journal = new SessionJournal(finalPath, turns.length);
    return ok(
      Object.freeze({
        chat: seed?.chat ?? Object.freeze({ activeNodeId: 0, turns: Object.freeze([]) }),
        history: seed?.history ?? ConversationTree.empty(),
        journal,
        recoveredPrefix: seed?.recoveredPrefix ?? false,
      }),
    );
  }

  async appendTurn(
    turn: ConversationTreeTurnSnapshot,
    presentation: SessionTurnPresentation,
  ): Promise<Result<void, SessionJournalError>> {
    if (
      this.#closed ||
      turn.id !== this.#turnCount + 1 ||
      turn.parentId < 0 ||
      turn.parentId > this.#turnCount
    ) {
      return err(failure("corrupt"));
    }
    const stored = storedTurn(turn, presentation);
    if (stored === undefined) {
      return err(failure("corrupt"));
    }
    const line = JSON.stringify(stored) + "\n";
    const encoded = encodeUtf8Text(line);
    let observedSize: number;
    try {
      observedSize = (await lstat(this.#journalPath)).size;
    } catch (_cause: unknown) {
      return err(failure("storage"));
    }
    if (
      !encoded.ok ||
      observedSize + (encoded.ok ? encoded.value.length : 0) >
        SESSION_JOURNAL_LIMITS.journalBytes ||
      !(await durableFile(this.#journalPath, line, "a"))
    ) {
      return err(failure(encoded.ok ? "storage" : "corrupt"));
    }
    this.#turnCount = turn.id;
    const selected = await this.select(turn.id);
    return selected.ok ? ok(undefined) : selected;
  }

  async select(nodeId: number): Promise<Result<void, SessionJournalError>> {
    if (
      this.#closed ||
      !Number.isSafeInteger(nodeId) ||
      nodeId < 0 ||
      nodeId > this.#turnCount
    ) {
      return err(failure("corrupt"));
    }
    this.#headRevision += 1;
    const temporary = path.join(
      this.#sessionPath,
      "head-" + String(pid) + "-" + String(this.#headRevision) + ".next",
    );
    if (!(await durableFile(temporary, headText(nodeId), "wx"))) {
      return err(failure("storage"));
    }
    try {
      await rename(temporary, path.join(this.#sessionPath, "head.json"));
    } catch (_cause: unknown) {
      await rm(temporary, { force: true, recursive: false });
      return err(failure("storage"));
    }
    return ok(undefined);
  }

  async close(): Promise<Result<void, SessionJournalError>> {
    if (this.#closed) {
      return ok(undefined);
    }
    this.#closed = true;
    try {
      await rm(this.#lockPath, { force: true, recursive: false });
      return ok(undefined);
    } catch (_cause: unknown) {
      return err(failure("storage"));
    }
  }
}
