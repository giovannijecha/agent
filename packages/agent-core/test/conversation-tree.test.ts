import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversationTree,
  ConversationTreeError,
  Message,
  Role,
} from "@agent/core";

function message(role: "assistant" | "user", content: string): Message {
  const created = Message.create(role, content);
  assert.ok(created.ok);
  return created.value;
}

function completed(user: string, assistant: string) {
  return Object.freeze([
    message(Role.User, user),
    message(Role.Assistant, assistant),
  ]);
}

test("retains siblings while materializing only the selected root-to-tip path", () => {
  const first = ConversationTree.empty().appendTurn(
    completed("root question", "root answer"),
    "completed",
  );
  assert.ok(first.ok);
  const originalTip = first.value.appendTurn(
    completed("original question", "original answer"),
    "completed",
  );
  assert.ok(originalTip.ok);
  const selectedParent = originalTip.value.select(1);
  assert.ok(selectedParent.ok);
  const branched = selectedParent.value.appendTurn(
    completed("branch question", "branch answer"),
    "completed",
  );
  assert.ok(branched.ok);

  assert.deepEqual(branched.value.activePathNodeIds, [1, 3]);
  assert.deepEqual(
    branched.value.conversation.entries.map((entry) =>
      entry instanceof Message ? entry.content : "tool exchange",
    ),
    ["root question", "root answer", "branch question", "branch answer"],
  );
  assert.deepEqual(
    branched.value.nodes.map((node) => [node.id, node.parentId, node.depth]),
    [
      [1, 0, 1],
      [2, 1, 2],
      [3, 1, 2],
    ],
  );

  const recovered = branched.value.select(2);
  assert.ok(recovered.ok);
  assert.deepEqual(
    recovered.value.conversation.entries.map((entry) =>
      entry instanceof Message ? entry.content : "tool exchange",
    ),
    [
      "root question",
      "root answer",
      "original question",
      "original answer",
    ],
  );
});

test("rejects malformed settlements and invalid node selections content-free", () => {
  const tree = ConversationTree.empty();
  const checkpoint = tree.appendTurn(
    completed("private user", "private assistant"),
    "checkpointed",
  );
  const invalidNode = tree.select(9);

  assert.equal(checkpoint.ok, false);
  assert.equal(invalidNode.ok, false);
  if (!checkpoint.ok) {
    assert.ok(checkpoint.error instanceof ConversationTreeError);
    assert.equal(checkpoint.error.kind, "invalidDelta");
    assert.equal(JSON.stringify(checkpoint.error).includes("private"), false);
  }
  if (!invalidNode.ok) {
    assert.equal(invalidNode.error.kind, "invalidNode");
  }
});

test("contains hostile turn-entry arrays behind invalidDelta", () => {
  const tree = ConversationTree.empty();
  const revoked = Proxy.revocable(
    completed("revoked user", "revoked assistant"),
    Object.freeze({}),
  );
  revoked.revoke();
  const lengthFailure = new Proxy(
    completed("length user", "length assistant"),
    {
      get(): never {
        throw new Error("private length");
      },
    },
  );
  const atFailure = new Proxy(
    completed("at user", "at assistant"),
    {
      get(target, property) {
        if (property === "length") return target.length;
        if (property === "at") throw new Error("private at");
        return undefined;
      },
    },
  );
  const iteratorFailure = new Proxy(
    completed("iterator user", "iterator assistant"),
    {
      get(target, property) {
        if (property === "length") return target.length;
        if (property === "at") return target.at;
        if (property === "0") return target.at(0);
        if (property === "1") return target.at(1);
        if (property === Symbol.iterator) {
          throw new Error("private iterator");
        }
        return undefined;
      },
    },
  );

  for (const entries of [
    revoked.proxy,
    lengthFailure,
    atFailure,
    iteratorFailure,
  ]) {
    const appended = tree.appendTurn(entries, "completed");
    assert.equal(appended.ok, false);
    if (!appended.ok) assert.equal(appended.error.kind, "invalidDelta");
  }
});

test("bounds the retained tree without evicting an older branch", () => {
  let tree = ConversationTree.empty();
  for (let turn = 1; turn <= 128; turn += 1) {
    const appended = tree.appendTurn(
      completed("u" + turn.toString(10), "a" + turn.toString(10)),
      "completed",
    );
    assert.ok(appended.ok);
    tree = appended.value;
  }

  const overflow = tree.appendTurn(completed("overflow", "answer"), "completed");
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.equal(overflow.error.kind, "turnLimit");
  assert.equal(tree.turnCount, 128);
  assert.equal(tree.nodes.at(0)?.id, 1);
});
