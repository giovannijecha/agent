import {
  Conversation,
  type ConversationEntry,
  conversationEntryCodeUnits,
  conversationEntryMessageUnits,
  Message,
  Role,
  ToolExchange,
} from "./conversation.js";
import { err, ok, type Result } from "./result.js";

export const CONVERSATION_TREE_LIMITS = Object.freeze({
  codeUnits: 1_048_576,
  messageUnits: 256,
  turns: 128,
});

export type ConversationTurnSettlement = "completed" | "checkpointed";

export type ConversationTreeErrorKind =
  | "codeUnitLimit"
  | "invalidDelta"
  | "invalidNode"
  | "messageUnitLimit"
  | "nodeIdExhausted"
  | "turnLimit";

/** Content-free rejection of one deterministic tree transition. */
export class ConversationTreeError {
  readonly #kind: ConversationTreeErrorKind;

  constructor(kind: ConversationTreeErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ConversationTreeErrorKind {
    return this.#kind;
  }
}

export type ConversationTreeNodeSnapshot = Readonly<{
  codeUnits: number;
  depth: number;
  id: number;
  messageUnits: number;
  parentId: number;
  settlement: ConversationTurnSettlement;
}>;

type ConversationTreeNode = ConversationTreeNodeSnapshot &
  Readonly<{ entries: readonly ConversationEntry[] }>;

function deltaMetrics(entries: readonly ConversationEntry[]): Readonly<{
  codeUnits: number;
  messageUnits: number;
}> {
  let codeUnits = 0;
  let messageUnits = 0;
  for (const entry of entries) {
    codeUnits += conversationEntryCodeUnits(entry);
    messageUnits += conversationEntryMessageUnits(entry);
  }
  return Object.freeze({ codeUnits, messageUnits });
}

function validDelta(
  entries: readonly ConversationEntry[],
  settlement: ConversationTurnSettlement,
): boolean {
  if (
    !Array.isArray(entries) ||
    entries.length < 2 ||
    (settlement !== "completed" && settlement !== "checkpointed")
  ) {
    return false;
  }
  const first = entries.at(0);
  if (!(first instanceof Message) || first.role !== Role.User) {
    return false;
  }
  const last = entries.at(-1);
  if (settlement === "completed") {
    if (!(last instanceof Message) || last.role !== Role.Assistant) {
      return false;
    }
    for (let index = 1; index < entries.length - 1; index += 1) {
      if (!(entries.at(index) instanceof ToolExchange)) {
        return false;
      }
    }
    return true;
  }
  for (let index = 1; index < entries.length; index += 1) {
    if (!(entries.at(index) instanceof ToolExchange)) {
      return false;
    }
  }
  return true;
}

/** Immutable process-memory tree with one selected root-to-node context. */
export class ConversationTree {
  readonly #activeNodeId: number;
  readonly #nodes: readonly ConversationTreeNode[];
  readonly #retainedCodeUnits: number;
  readonly #retainedMessageUnits: number;

  private constructor(
    nodes: readonly ConversationTreeNode[],
    activeNodeId: number,
    retainedCodeUnits: number,
    retainedMessageUnits: number,
  ) {
    this.#nodes = Object.freeze([...nodes]);
    this.#activeNodeId = activeNodeId;
    this.#retainedCodeUnits = retainedCodeUnits;
    this.#retainedMessageUnits = retainedMessageUnits;
    Object.freeze(this);
  }

  static empty(): ConversationTree {
    return new ConversationTree([], 0, 0, 0);
  }

  /** Appends one settled turn below the selected node and selects the new tip. */
  appendTurn(
    entries: readonly ConversationEntry[],
    settlement: ConversationTurnSettlement,
  ): Result<ConversationTree, ConversationTreeError> {
    if (!validDelta(entries, settlement)) {
      return err(new ConversationTreeError("invalidDelta"));
    }
    if (this.#nodes.length >= CONVERSATION_TREE_LIMITS.turns) {
      return err(new ConversationTreeError("turnLimit"));
    }
    const id = this.#nodes.length + 1;
    if (!Number.isSafeInteger(id) || id > Number.MAX_SAFE_INTEGER) {
      return err(new ConversationTreeError("nodeIdExhausted"));
    }
    const metrics = deltaMetrics(entries);
    if (
      this.#retainedCodeUnits + metrics.codeUnits >
      CONVERSATION_TREE_LIMITS.codeUnits
    ) {
      return err(new ConversationTreeError("codeUnitLimit"));
    }
    if (
      this.#retainedMessageUnits + metrics.messageUnits >
      CONVERSATION_TREE_LIMITS.messageUnits
    ) {
      return err(new ConversationTreeError("messageUnitLimit"));
    }
    const parent = this.#activeNodeId === 0
      ? undefined
      : this.#nodes.at(this.#activeNodeId - 1);
    if (this.#activeNodeId !== 0 && parent === undefined) {
      return err(new ConversationTreeError("invalidNode"));
    }
    const node: ConversationTreeNode = Object.freeze({
      codeUnits: metrics.codeUnits,
      depth: (parent?.depth ?? 0) + 1,
      entries: Object.freeze([...entries]),
      id,
      messageUnits: metrics.messageUnits,
      parentId: this.#activeNodeId,
      settlement,
    });
    return ok(
      new ConversationTree(
        [...this.#nodes, node],
        id,
        this.#retainedCodeUnits + metrics.codeUnits,
        this.#retainedMessageUnits + metrics.messageUnits,
      ),
    );
  }

  /** Selects one retained node or the content-free root. */
  select(nodeId: number): Result<ConversationTree, ConversationTreeError> {
    if (
      !Number.isSafeInteger(nodeId) ||
      nodeId < 0 ||
      (nodeId !== 0 && this.#nodes.at(nodeId - 1)?.id !== nodeId)
    ) {
      return err(new ConversationTreeError("invalidNode"));
    }
    return ok(
      new ConversationTree(
        this.#nodes,
        nodeId,
        this.#retainedCodeUnits,
        this.#retainedMessageUnits,
      ),
    );
  }

  /** Materializes only the selected root-to-node path for the model. */
  get conversation(): Conversation {
    const ordered: ConversationTreeNode[] = [];
    let nodeId = this.#activeNodeId;
    while (nodeId !== 0) {
      const node = this.#nodes.at(nodeId - 1);
      if (node === undefined) {
        return Conversation.empty();
      }
      ordered.push(node);
      nodeId = node.parentId;
    }
    let conversation = Conversation.empty();
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const node = ordered.at(index);
      if (node === undefined) {
        continue;
      }
      for (const entry of node.entries) {
        conversation = conversation.append(entry);
      }
    }
    return conversation;
  }

  get activeNodeId(): number {
    return this.#activeNodeId;
  }

  get activePathNodeIds(): readonly number[] {
    const reversed: number[] = [];
    let nodeId = this.#activeNodeId;
    while (nodeId !== 0) {
      reversed.push(nodeId);
      nodeId = this.#nodes.at(nodeId - 1)?.parentId ?? 0;
    }
    reversed.reverse();
    return Object.freeze(reversed);
  }

  get nodes(): readonly ConversationTreeNodeSnapshot[] {
    return Object.freeze(
      this.#nodes.map((node) =>
        Object.freeze({
          codeUnits: node.codeUnits,
          depth: node.depth,
          id: node.id,
          messageUnits: node.messageUnits,
          parentId: node.parentId,
          settlement: node.settlement,
        }),
      ),
    );
  }

  get retainedCodeUnits(): number {
    return this.#retainedCodeUnits;
  }

  get retainedMessageUnits(): number {
    return this.#retainedMessageUnits;
  }

  get turnCount(): number {
    return this.#nodes.length;
  }
}
