import assert from "node:assert/strict";
import test from "node:test";

import type { TurnFailure } from "@agent/runtime";

import { projectTurnFailure } from "../dist/turn-failure-presentation.js";

const CASES = [
  [{ kind: "model", operation: "open", error: "private" }, "model/open"],
  [{ kind: "model", operation: "read", error: "private" }, "model/read"],
  [{ kind: "invalidModelResult", operation: "open" }, "model/open/invalid-result"],
  [{ kind: "invalidModelResult", operation: "read" }, "model/read/invalid-result"],
  [{ kind: "unexpected", operation: "open" }, "model/open/unexpected"],
  [{ kind: "unexpected", operation: "read" }, "model/read/unexpected"],
  [{ kind: "invalidModelStream" }, "model/open/invalid-stream"],
  [{ kind: "invalidModelEvent" }, "model/read/invalid-event"],
  [{ kind: "invalidToolCall" }, "tool/invalid-call"],
  [{ kind: "toolEngine" }, "tool/engine"],
  [{ kind: "toolLimit" }, "tool/limit"],
  [{ kind: "toolUnavailable" }, "tool/unavailable"],
  [{ kind: "emptyDelta" }, "model/empty-delta"],
  [{ kind: "emptyResponse" }, "model/empty-response"],
  [{ kind: "eventLimit" }, "model/event-limit"],
  [{ kind: "responseTooLong" }, "model/response-limit"],
] as const satisfies readonly (readonly [TurnFailure<string>, string])[];

test("maps every admitted turn failure to one content-free closed code", () => {
  for (const [failure, expectedCode] of CASES) {
    const projected = projectTurnFailure(failure, true);
    assert.equal(projected.code, expectedCode);
    assert.equal(
      projected.checkpointedMarker,
      "[turn failed (" + expectedCode + ") after completed tool activity]",
    );
    assert.equal(projected.notice.includes(expectedCode), true);
    assert.equal(projected.notice.includes("private"), false);
    assert.equal(Object.isFrozen(projected), true);
  }
});

test("distinguishes retained tool truth from an uncommitted failed turn", () => {
  assert.equal(
    projectTurnFailure({ kind: "toolLimit" }, true).notice,
    "The turn failed (tool/limit); completed tool activity remains in conversation.",
  );
  assert.equal(
    projectTurnFailure({ kind: "toolLimit" }, false).notice,
    "The turn failed (tool/limit); no conversation changes were committed.",
  );
});

test("maps an unknown hostile variant to one content-free residual code", () => {
  const projected = projectTurnFailure(
    Object.freeze({ kind: "hostile", secret: "PRIVATE_SECRET" }) as never,
    true,
  );
  assert.equal(projected.code, "runtime/failure");
  assert.equal(projected.notice.includes("PRIVATE_SECRET"), false);
});
