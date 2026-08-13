import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { execPath, platform } from "node:process";
import test from "node:test";

import {
  ok,
  StructuredList,
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import type { ToolCancellation, ToolEngine, ToolExecution } from "@agent/tools";

import { createBuiltinToolEngine } from "../dist/builtin-tools.js";
import {
  PROCESS_RUNNER_LIMITS,
  type ProcessRunRequest,
  type ProcessRunner,
} from "../dist/process-runner.js";
import { WorkspaceBoundary } from "../dist/workspace-boundary.js";
import { WorkspaceReadPolicy } from "../dist/workspace-read-policy.js";

const cancellation: ToolCancellation = Object.freeze({
  requested: false,
  whenRequested: async () => new Promise<void>(() => undefined),
});

const processRunner: ProcessRunner = Object.freeze({
  run: async (request: ProcessRunRequest) =>
    ok(
      Object.freeze({
        exitCode: 0,
        outcome: "exited" as const,
        stderr: "",
        stdout: request.arguments.join("\u0000"),
      }),
    ),
});

const workspaceProtection = Object.freeze({
  homeDirectory: homedir(),
  temporaryDirectory: tmpdir(),
});

async function engine(
  root: string,
  runner: ProcessRunner = processRunner,
): Promise<ToolEngine> {
  const boundary = await WorkspaceBoundary.create(root, workspaceProtection);
  assert.ok(boundary.ok);
  const policy = await WorkspaceReadPolicy.load(boundary.value, platform);
  assert.ok(policy.ok);
  const created = createBuiltinToolEngine(boundary.value, policy.value, {
    nodeExecutable: execPath,
    processRunner: runner,
  });
  assert.ok(created.ok);
  assert.deepEqual(
    created.value.descriptors.map((descriptor) => [
      descriptor.name,
      descriptor.risk,
    ]),
    [
      ["read_file", "read"],
      ["list_directory", "read"],
      ["search_text", "read"],
      ["create_file", "write"],
      ["replace_text", "write"],
      ["run_process", "execute"],
    ],
  );
  return created.value;
}

test("runs only the registered program with structured arguments", async () => {
  await withWorkspace(async (workspace) => {
    let received: ProcessRunRequest | undefined;
    const trackingRunner: ProcessRunner = Object.freeze({
      run: async (request: ProcessRunRequest) => {
        received = request;
        return ok(
          Object.freeze({
            exitCode: 0,
            outcome: "exited" as const,
            stderr: "",
            stdout: request.arguments.join("\u0000"),
          }),
        );
      },
    });
    const tools = await engine(workspace, trackingRunner);
    const execution = await execute(tools, "run_process", {
      arguments: ["--version", "literal value"],
      program: "node",
      workingDirectory: ".",
    });
    assert.equal(execution.result.status, "success");
    assert.equal(output(execution).get("stdout"), "--version\u0000literal value");
    assert.equal(received?.workingDirectory, await realpath(workspace));

    const unsupportedInput = structuredValueFromUnknown({
      arguments: [],
      program: "python",
      workingDirectory: ".",
    });
    assert.ok(
      unsupportedInput.ok && unsupportedInput.value instanceof StructuredObject,
    );
    assert.deepEqual(
      tools.prepare(
        "call-unsupported",
        "run_process",
        unsupportedInput.value,
      ),
      { ok: false, error: { kind: "invalidInput" } },
    );
  });
});

test("rejects process text and approval projections beyond their exact limits", async () => {
  await withWorkspace(async (workspace) => {
    let runnerCalls = 0;
    const trackingRunner: ProcessRunner = Object.freeze({
      run: async () => {
        runnerCalls += 1;
        return ok(
          Object.freeze({
            exitCode: 0,
            outcome: "exited" as const,
            stderr: "",
            stdout: "",
          }),
        );
      },
    });
    const tools = await engine(workspace, trackingRunner);

    const oversizedUtf8 = structuredValueFromUnknown({
      arguments: [
        "\u6f22".repeat(PROCESS_RUNNER_LIMITS.argumentCodeUnits + 1),
      ],
      program: "node",
      workingDirectory: ".",
    });
    assert.ok(
      oversizedUtf8.ok && oversizedUtf8.value instanceof StructuredObject,
    );
    assert.deepEqual(
      tools.prepare("call-oversized-utf8", "run_process", oversizedUtf8.value),
      { ok: false, error: { kind: "invalidInput" } },
    );

    const oversizedProjection = structuredValueFromUnknown({
      arguments: Array.from({ length: 4 }, () => "x".repeat(2_700)),
      program: "node",
      workingDirectory: ".",
    });
    assert.ok(
      oversizedProjection.ok &&
        oversizedProjection.value instanceof StructuredObject,
    );
    assert.deepEqual(
      tools.prepare(
        "call-oversized-projection",
        "run_process",
        oversizedProjection.value,
      ),
      { ok: false, error: { kind: "invalidInput" } },
    );
    assert.equal(runnerCalls, 0);
  });
});

test("preserves a nonzero process result as a recoverable failed tool outcome", async () => {
  await withWorkspace(async (workspace) => {
    const failedRunner: ProcessRunner = Object.freeze({
      run: async () =>
        ok(
          Object.freeze({
            exitCode: 23,
            outcome: "exited" as const,
            stderr: "owned stderr",
            stdout: "owned stdout",
          }),
        ),
    });
    const execution = await execute(
      await engine(workspace, failedRunner),
      "run_process",
      {
        arguments: ["--owned"],
        program: "node",
        workingDirectory: ".",
      },
    );

    assert.equal(execution.result.status, "failure");
    assert.equal(execution.contractFailure, false);
    assert.equal(output(execution).get("exitCode"), 23);
    assert.equal(output(execution).get("stderr"), "owned stderr");
    assert.equal(output(execution).get("stdout"), "owned stdout");
  });
});

test("distinguishes invalid roots, read policies, and platform adapters", async () => {
  assert.deepEqual(
    createBuiltinToolEngine("relative", undefined, {
      nodeExecutable: execPath,
      processRunner,
    }),
    { ok: false, error: { kind: "invalidRoot" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(
      Object.freeze({ root: path.resolve(".") }),
      undefined,
      {
      nodeExecutable: execPath,
      processRunner,
      },
    ),
    { ok: false, error: { kind: "invalidRoot" } },
  );
  const forgedPrototype = Object.create(WorkspaceBoundary.prototype) as {
    root?: string;
  };
  Object.defineProperty(forgedPrototype, "root", {
    value: path.resolve("."),
  });
  assert.deepEqual(
    createBuiltinToolEngine(forgedPrototype, undefined, {
      nodeExecutable: execPath,
      processRunner,
    }),
    { ok: false, error: { kind: "invalidRoot" } },
  );
  const boundary = await WorkspaceBoundary.create(
    path.resolve("."),
    workspaceProtection,
  );
  assert.ok(boundary.ok);
  const policy = await WorkspaceReadPolicy.load(boundary.value, platform);
  assert.ok(policy.ok);
  assert.deepEqual(
    createBuiltinToolEngine(boundary.value, undefined, {
      nodeExecutable: execPath,
      processRunner,
    }),
    { ok: false, error: { kind: "invalidReadPolicy" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(boundary.value, policy.value, {
      nodeExecutable: "relative",
      processRunner,
    }),
    { ok: false, error: { kind: "invalidPlatform" } },
  );
});

async function execute(
  tools: ToolEngine,
  name: string,
  input: unknown,
): Promise<ToolExecution> {
  const value = structuredValueFromUnknown(input);
  assert.ok(value.ok && value.value instanceof StructuredObject);
  const prepared = tools.prepare("call-" + name, name, value.value);
  assert.ok(prepared.ok);
  const result = await tools.execute(prepared.value, cancellation);
  assert.ok(result.ok);
  return result.value;
}

function output(execution: ToolExecution): StructuredObject {
  assert.ok(execution.result.output instanceof StructuredObject);
  return execution.result.output;
}

function objectList(
  execution: ToolExecution,
  field: string,
): readonly StructuredObject[] {
  const value = output(execution).get(field);
  assert.ok(value instanceof StructuredList);
  assert.ok(value.values.every((item) => item instanceof StructuredObject));
  return value.values as readonly StructuredObject[];
}

async function withWorkspace(
  action: (workspace: string, outside: string) => Promise<void>,
): Promise<void> {
  const container = await mkdtemp(path.join(tmpdir(), "agent-tools-test-"));
  const workspace = path.join(container, "workspace");
  const outside = path.join(container, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  try {
    await action(workspace, outside);
  } finally {
    const resolvedContainer = path.resolve(container);
    const resolvedTemporary = path.resolve(tmpdir());
    assert.ok(
      resolvedContainer.startsWith(resolvedTemporary + path.sep),
      "temporary cleanup must remain beneath the OS temp directory",
    );
    await rm(resolvedContainer, { force: true, recursive: true });
  }
}

test("creates, reads, replaces, lists, and searches bounded workspace text", async () => {
  await withWorkspace(async (workspace) => {
    const tools = await engine(workspace);
    const created = await execute(tools, "create_file", {
      content: "α € 😀\nbeta\n",
      path: "notes.txt",
    });
    assert.equal(created.result.status, "success");

    const read = await execute(tools, "read_file", { path: "notes.txt" });
    assert.equal(output(read).get("text"), "α € 😀\nbeta\n");

    const replaced = await execute(tools, "replace_text", {
      newText: "owned € 😀",
      oldText: "beta",
      path: "notes.txt",
    });
    assert.equal(replaced.result.status, "success");
    assert.equal(
      await readFile(path.join(workspace, "notes.txt"), { encoding: "utf8" }),
      "α € 😀\nowned € 😀\n",
    );

    const listed = await execute(tools, "list_directory", { path: "." });
    assert.equal(listed.result.status, "success");
    const searched = await execute(tools, "search_text", {
      path: ".",
      query: "owned",
    });
    assert.equal(searched.result.status, "success");
  });
});

test("enforces the disclosure policy before reads and prunes discovery", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "private"));
    await mkdir(path.join(workspace, ".git"));
    await mkdir(path.join(workspace, "public"));
    await writeFile(
      path.join(workspace, ".agentignore"),
      "private/\n**/*.secret\n",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(path.join(workspace, ".env"), "owned-marker env-secret", {
      encoding: "utf8",
      flag: "wx",
    });
    await writeFile(
      path.join(workspace, ".git", "config"),
      "owned-marker repository-secret",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(workspace, "private", "report.txt"),
      "owned-marker private-secret",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(workspace, "token.secret"),
      "owned-marker token-secret",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(workspace, "server.pem"),
      "owned-marker key-secret",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(workspace, "public", "report.txt"),
      "owned-marker public-value",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(workspace, "README.md"),
      "owned-marker readme-value",
      { encoding: "utf8", flag: "wx" },
    );

    const tools = await engine(workspace);
    for (const execution of [
      await execute(tools, "read_file", { path: ".agentignore" }),
      await execute(tools, "read_file", { path: ".env" }),
      await execute(tools, "read_file", { path: ".env.missing" }),
      await execute(tools, "read_file", { path: "private/report.txt" }),
      await execute(tools, "read_file", { path: "token.secret" }),
      await execute(tools, "read_file", { path: "server.pem" }),
      await execute(tools, "list_directory", { path: "private" }),
      await execute(tools, "search_text", {
        path: "private",
        query: "owned-marker",
      }),
    ]) {
      assert.equal(execution.result.status, "failure");
      assert.equal(output(execution).get("error"), "permission");
    }

    const listed = await execute(tools, "list_directory", { path: "." });
    assert.equal(listed.result.status, "success");
    assert.deepEqual(
      objectList(listed, "entries").map((entry) => entry.get("name")),
      ["public", "README.md"],
    );

    const searched = await execute(tools, "search_text", {
      path: ".",
      query: "owned-marker",
    });
    assert.equal(searched.result.status, "success");
    const matches = objectList(searched, "matches");
    assert.deepEqual(
      matches.map((match) => match.get("path")),
      ["README.md", path.join("public", "report.txt")],
    );
    assert.deepEqual(
      matches.map((match) => match.get("text")),
      ["owned-marker readme-value", "owned-marker public-value"],
    );

    const created = await execute(tools, "create_file", {
      content: "created without disclosure",
      path: "private/created.txt",
    });
    assert.equal(created.result.status, "success");
    const replaced = await execute(tools, "replace_text", {
      newText: "updated without disclosure",
      oldText: "private-secret",
      path: "private/report.txt",
    });
    assert.equal(replaced.result.status, "success");
  });
});

test("rejects Windows DOS aliases for denied read paths", async () => {
  if (platform !== "win32") {
    return;
  }
  await withWorkspace(async (workspace) => {
    const deniedDirectory = path.join(workspace, "credential-store");
    const aliasDirectory = path.join(workspace, "CREDEN~1");
    await mkdir(deniedDirectory);
    await writeFile(
      path.join(workspace, ".agentignore"),
      "credential-store/\n",
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      path.join(deniedDirectory, "secret.txt"),
      "owned-marker alias-secret",
      { encoding: "utf8", flag: "wx" },
    );
    const longStatus = await lstat(deniedDirectory);
    const aliasStatus = await lstat(aliasDirectory);
    assert.equal(aliasStatus.dev, longStatus.dev);
    assert.equal(aliasStatus.ino, longStatus.ino);

    const tools = await engine(workspace);
    for (const execution of [
      await execute(tools, "read_file", {
        path: path.join("CREDEN~1", "secret.txt"),
      }),
      await execute(tools, "list_directory", { path: "CREDEN~1" }),
      await execute(tools, "search_text", {
        path: "CREDEN~1",
        query: "owned-marker",
      }),
    ]) {
      assert.equal(execution.result.status, "failure");
      assert.equal(output(execution).get("error"), "permission");
    }
  });
});

test("counts denied directory entries against the raw enumeration bound", async () => {
  await withWorkspace(async (workspace) => {
    for (let index = 0; index <= 512; index += 1) {
      await writeFile(
        path.join(workspace, ".env." + String(index)),
        "private",
        { encoding: "utf8", flag: "wx" },
      );
    }
    const listed = await execute(
      await engine(workspace),
      "list_directory",
      { path: "." },
    );
    assert.equal(listed.result.status, "failure");
    assert.equal(output(listed).get("error"), "limit");
  });
});

test("rejects parent traversal, overwrite, ambiguous replacement, and symlinks", async () => {
  await withWorkspace(async (workspace, outside) => {
    const tools = await engine(workspace);
    await writeFile(path.join(workspace, "duplicate.txt"), "x x", {
      encoding: "utf8",
      flag: "wx",
    });
    await writeFile(path.join(outside, "secret.txt"), "secret", {
      encoding: "utf8",
      flag: "wx",
    });
    await mkdir(path.join(workspace, "internal"));
    await writeFile(path.join(workspace, "internal", "owned.txt"), "owned", {
      encoding: "utf8",
      flag: "wx",
    });
    await symlink(outside, path.join(workspace, "link"), "junction");
    await symlink(
      path.join(workspace, "internal"),
      path.join(workspace, "internal-link"),
      "junction",
    );

    for (const execution of [
      await execute(tools, "read_file", { path: "../outside/secret.txt" }),
      await execute(tools, "read_file", { path: "link/secret.txt" }),
      await execute(tools, "read_file", {
        path: "internal-link/owned.txt",
      }),
      await execute(tools, "create_file", {
        content: "new",
        path: "duplicate.txt",
      }),
      await execute(tools, "replace_text", {
        newText: "y",
        oldText: "x",
        path: "duplicate.txt",
      }),
    ]) {
      assert.equal(execution.result.status, "failure");
    }
  });
});
