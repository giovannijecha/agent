import assert from "node:assert/strict";
import test from "node:test";

import { err, ok } from "@agent/core";

import { HiddenCredentialPromptError } from "../dist/hidden-credential-prompt.js";
import { acquireProviderCredential } from "../dist/startup-credential.js";

const TERMINATED = Object.freeze({ kind: "terminated" });

async function expectTermination(pending: Promise<unknown>): Promise<void> {
  try {
    await pending;
  } catch (cause: unknown) {
    assert.equal(cause, TERMINATED);
    return;
  }
  assert.ok(false, "startup unexpectedly continued after termination");
}

test("keeps configured and non-interactive startup free of prompting", async () => {
  let promptCount = 0;
  const prompt = () => {
    promptCount += 1;
    return Promise.resolve(ok(Object.freeze({ kind: "skipped" as const })));
  };
  const terminate = async (): Promise<never> => {
    throw TERMINATED;
  };

  assert.equal(
    await acquireProviderCredential("configured", true, prompt, terminate),
    "configured",
  );
  assert.equal(
    await acquireProviderCredential(undefined, false, prompt, terminate),
    undefined,
  );
  assert.equal(promptCount, 0);
});

test("returns only an explicitly provided interactive credential", async () => {
  const terminate = async (): Promise<never> => {
    throw TERMINATED;
  };

  assert.equal(
    await acquireProviderCredential(
      undefined,
      true,
      () =>
        Promise.resolve(
          ok(Object.freeze({ credential: "provided", kind: "provided" as const })),
        ),
      terminate,
    ),
    "provided",
  );
  assert.equal(
    await acquireProviderCredential(
      undefined,
      true,
      () => Promise.resolve(ok(Object.freeze({ kind: "skipped" as const }))),
      terminate,
    ),
    undefined,
  );
});

test("makes prompt failures and cancellation terminal without retaining causes", async () => {
  const terminations: Array<Readonly<{ code: number; diagnostic: string }>> = [];
  const terminate = async (diagnostic: string, code: number): Promise<never> => {
    terminations.push(Object.freeze({ code, diagnostic }));
    throw TERMINATED;
  };

  await expectTermination(
    acquireProviderCredential(
      undefined,
      true,
      () => Promise.resolve(err(new HiddenCredentialPromptError("input"))),
      terminate,
    ),
  );
  await expectTermination(
    acquireProviderCredential(
      undefined,
      true,
      () => Promise.reject(new Error("private prompt cause")),
      terminate,
    ),
  );
  await expectTermination(
    acquireProviderCredential(
      undefined,
      true,
      () => Promise.resolve(ok(Object.freeze({ kind: "cancelled" as const }))),
      terminate,
    ),
  );

  assert.deepEqual(terminations, [
    { code: 1, diagnostic: "agent could not read the provider credential\n" },
    { code: 1, diagnostic: "agent could not read the provider credential\n" },
    { code: 130, diagnostic: "" },
  ]);
});
