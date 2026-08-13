import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { WorkspaceBoundary } from "../dist/workspace-boundary.js";
import {
  WORKSPACE_READ_POLICY_LIMITS,
  WorkspaceReadPolicy,
  WorkspaceReadPolicyError,
} from "../dist/workspace-read-policy.js";

const workspaceProtection = Object.freeze({
  homeDirectory: homedir(),
  temporaryDirectory: tmpdir(),
});

async function boundary(root: string): Promise<WorkspaceBoundary> {
  const created = await WorkspaceBoundary.create(root, workspaceProtection);
  assert.ok(created.ok);
  return created.value;
}

async function policy(
  root: string,
  targetPlatform: "linux" | "win32" = "linux",
): Promise<WorkspaceReadPolicy> {
  const loaded = await WorkspaceReadPolicy.load(
    await boundary(root),
    targetPlatform,
  );
  assert.ok(loaded.ok);
  return loaded.value;
}

function denied(value: WorkspaceReadPolicy, relative: unknown): boolean {
  const result = value.denies(relative);
  assert.ok(result.ok);
  return result.value;
}

async function withWorkspace(
  action: (workspace: string, outside: string) => Promise<void>,
): Promise<void> {
  const container = await mkdtemp(path.join(tmpdir(), "agent-policy-test-"));
  const workspace = path.join(container, "workspace");
  const outside = path.join(container, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  try {
    await action(workspace, outside);
  } finally {
    const resolvedContainer = path.resolve(container);
    const resolvedTemporary = path.resolve(tmpdir());
    assert.ok(resolvedContainer.startsWith(resolvedTemporary + path.sep));
    await rm(resolvedContainer, { force: true, recursive: true });
  }
}

test("applies the immutable built-in disclosure policy without a workspace file", async () => {
  await withWorkspace(async (workspace) => {
    const value = await policy(workspace);
    for (const relative of [
      ".agentignore",
      ".git",
      ".git/config",
      ".env",
      ".env.local",
      "nested/.env.production",
      ".ssh/id_owned",
      ".aws/credentials",
      ".azure/profile.json",
      ".config/gcloud/credentials.db",
      ".kube/config",
      ".docker/config.json",
      ".npmrc",
      ".pypirc",
      ".netrc",
      ".git-credentials",
      "keys/id_rsa",
      "keys/id_dsa",
      "keys/id_ecdsa",
      "keys/id_ed25519",
      "keys/server.key",
      "keys/server.pem",
      "keys/server.p12",
      "keys/server.pfx",
      "keys/server.jks",
      "keys/server.keystore",
    ]) {
      assert.equal(denied(value, relative), true, relative);
    }
    for (const relative of [
      ".",
      "README.md",
      ".environment",
      ".config/application.json",
      ".docker/README.md",
      "keys/id_rsa.pub",
      "keys/server.pem.txt",
    ]) {
      assert.equal(denied(value, relative), false, relative);
    }
  });
});

test("combines workspace rules with built-ins and fixes the snapshot until restart", async () => {
  await withWorkspace(async (workspace) => {
    const policyPath = path.join(workspace, ".agentignore");
    await writeFile(policyPath, "private/\n**/*.secret\n", {
      encoding: "utf8",
      flag: "wx",
    });
    const first = await policy(workspace);
    assert.equal(denied(first, "private/report.txt"), true);
    assert.equal(denied(first, "nested/token.secret"), true);
    assert.equal(denied(first, "public/report.txt"), false);
    assert.equal(denied(first, ".env"), true);

    await writeFile(policyPath, "replacement/**\n", {
      encoding: "utf8",
      flag: "w",
    });
    assert.equal(denied(first, "private/report.txt"), true);
    assert.equal(denied(first, "replacement/report.txt"), false);

    const restarted = await policy(workspace);
    assert.equal(denied(restarted, "private/report.txt"), false);
    assert.equal(denied(restarted, "replacement/report.txt"), true);
    assert.equal(denied(restarted, ".agentignore"), true);
  });
});

test("uses platform-declared case behavior without locale folding", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, ".agentignore"),
      "Docs/*.OWNED\nÄrea/Secret\n",
      { encoding: "utf8", flag: "wx" },
    );
    const linux = await policy(workspace, "linux");
    const windows = await policy(workspace, "win32");

    assert.equal(denied(linux, "docs/file.owned"), false);
    assert.equal(denied(windows, "docs/file.owned"), true);
    assert.equal(denied(windows, ".ENV.LOCAL"), true);
    assert.equal(denied(linux, ".ENV.LOCAL"), false);
    assert.equal(denied(windows, "CREDEN~1/secret.txt"), true);
    assert.equal(denied(windows, "PACKAG~12.JSO"), true);
    assert.equal(denied(linux, "CREDEN~1/secret.txt"), false);
    assert.equal(denied(windows, "owned~1suffix.txt"), false);
    assert.equal(denied(windows, "ärea/secret"), false);
    assert.equal(denied(windows, "Ärea/secret"), true);
  });
});

test("rejects malformed, non-regular, linked, oversized, and invalid UTF-8 policies", async () => {
  await withWorkspace(async (workspace, outside) => {
    const acceptedBoundary = await boundary(workspace);
    const policyPath = path.join(workspace, ".agentignore");

    await writeFile(policyPath, "!negation\n", {
      encoding: "utf8",
      flag: "wx",
    });
    let loaded = await WorkspaceReadPolicy.load(acceptedBoundary, "linux");
    assert.ok(!loaded.ok);
    assert.equal(loaded.error.kind, "invalidPolicy");

    await writeFile(policyPath, new Uint8Array([0xc3, 0x28]));
    loaded = await WorkspaceReadPolicy.load(acceptedBoundary, "linux");
    assert.ok(!loaded.ok);
    assert.equal(loaded.error.kind, "invalidPolicy");

    await writeFile(policyPath, new Uint8Array([0]));
    loaded = await WorkspaceReadPolicy.load(acceptedBoundary, "linux");
    assert.ok(!loaded.ok);
    assert.equal(loaded.error.kind, "invalidPolicy");

    await writeFile(
      policyPath,
      "x".repeat(WORKSPACE_READ_POLICY_LIMITS.fileBytes + 1),
      { encoding: "utf8", flag: "w" },
    );
    loaded = await WorkspaceReadPolicy.load(acceptedBoundary, "linux");
    assert.ok(!loaded.ok);
    assert.equal(loaded.error.kind, "limit");

    await rm(policyPath, { force: true, recursive: false });
    await mkdir(policyPath);
    loaded = await WorkspaceReadPolicy.load(acceptedBoundary, "linux");
    assert.ok(!loaded.ok);
    assert.equal(loaded.error.kind, "invalidPolicy");

    await rm(policyPath, { force: true, recursive: true });
    await symlink(outside, policyPath, "junction");
    loaded = await WorkspaceReadPolicy.load(acceptedBoundary, "linux");
    assert.ok(!loaded.ok);
    assert.equal(loaded.error.kind, "invalidPolicy");
  });
});

test("rejects forged authorities, mismatched roots, platforms, and targets", async () => {
  await withWorkspace(async (workspace, outside) => {
    const acceptedBoundary = await boundary(workspace);
    const value = await policy(workspace);

    const invalidBoundary = await WorkspaceReadPolicy.load(workspace, "linux");
    assert.ok(!invalidBoundary.ok);
    assert.equal(invalidBoundary.error.kind, "invalidBoundary");
    const invalidPlatform = await WorkspaceReadPolicy.load(
      acceptedBoundary,
      "darwin",
    );
    assert.ok(!invalidPlatform.ok);
    assert.equal(invalidPlatform.error.kind, "invalidPlatform");

    const mismatched = WorkspaceReadPolicy.forRoot(value, outside);
    assert.ok(!mismatched.ok);
    assert.equal(mismatched.error.kind, "invalidBoundary");
    const forged = Object.create(
      WorkspaceReadPolicy.prototype,
    ) as WorkspaceReadPolicy;
    const forgedRoot = WorkspaceReadPolicy.forRoot(forged, workspace);
    assert.ok(!forgedRoot.ok);
    assert.equal(forgedRoot.error.kind, "invalidBoundary");
    const forgedMatch = forged.denies("README.md");
    assert.ok(!forgedMatch.ok);
    assert.equal(forgedMatch.error.kind, "invalidPolicy");

    const invalidTarget = value.denies("../outside");
    assert.ok(!invalidTarget.ok);
    assert.equal(invalidTarget.error.kind, "invalidPolicy");

    const error = new WorkspaceReadPolicyError("invalidPolicy");
    assert.equal(Object.isFrozen(error), true);
    assert.deepEqual(Object.keys(error), []);
  });
});
