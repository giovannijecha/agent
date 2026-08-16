import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { arch, execPath, platform } from "node:process";
import test from "node:test";

import {
  ok,
  StructuredList,
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import type {
  PlannedToolCall,
  PreparedToolCall,
  ToolCancellation,
  ToolEngine,
  ToolExecution,
} from "@agent/tools";

import {
  BUILTIN_TOOL_LIMITS,
  createBuiltinToolEngine,
} from "../dist/builtin-tools.js";
import { EvaluationReceiptRecorder } from "../dist/evaluation-receipt.js";
import { PlatformWorkspaceMutationCommitter } from "../dist/platform-workspace-mutation.js";
import { PlatformWorkspaceNamespaceCommitter } from "../dist/platform-workspace-namespace.js";
import {
  PROCESS_RUNNER_LIMITS,
  type ProcessRunRequest,
  type ProcessRunner,
} from "../dist/process-runner.js";
import { ProcessProgramRegistry } from "../dist/process-program-registry.js";
import { TOOL_PERMISSION_DEFINITIONS } from "../dist/tool-permissions.js";
import { WorkspaceBoundary } from "../dist/workspace-boundary.js";
import {
  patchMutationPreview,
  projectPatchMutationPreview,
  WORKSPACE_MUTATION_PREVIEW_CODE_UNITS,
} from "../dist/workspace-mutation-preview.js";
import { WorkspaceReadPolicy } from "../dist/workspace-read-policy.js";
import { TEXT_PATCH_LIMITS } from "../dist/workspace-text-patch.js";

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

function toolPlatform(runner: ProcessRunner = processRunner) {
  const committer = PlatformWorkspaceMutationCommitter.create(platform, arch);
  const namespaceCommitter = PlatformWorkspaceNamespaceCommitter.create(
    platform,
    arch,
  );
  const programs = ProcessProgramRegistry.create(execPath);
  assert.ok(committer.ok);
  assert.ok(namespaceCommitter.ok);
  assert.ok(programs.ok);
  return Object.freeze({
    mutationCommitter: committer.value,
    namespaceCommitter: namespaceCommitter.value,
    processPrograms: programs.value,
    processRunner: runner,
  });
}

function patchInput(
  path: string,
  oldText: string,
  newText: string,
): Readonly<{
  hunks: readonly Readonly<{ newText: string; oldText: string }>[];
  path: string;
}> {
  return Object.freeze({
    hunks: Object.freeze([Object.freeze({ newText, oldText })]),
    path,
  });
}

async function engine(
  root: string,
  runner: ProcessRunner = processRunner,
  observer?: EvaluationReceiptRecorder,
): Promise<ToolEngine> {
  const boundary = await WorkspaceBoundary.create(root, workspaceProtection);
  assert.ok(boundary.ok);
  const policy = await WorkspaceReadPolicy.load(boundary.value, platform);
  assert.ok(policy.ok);
  const created = createBuiltinToolEngine(
    boundary.value,
    policy.value,
    toolPlatform(runner),
    observer,
  );
  assert.ok(created.ok);
  assert.deepEqual(
    created.value.descriptors.map((descriptor) => [
      descriptor.name,
      descriptor.risk,
    ]),
    TOOL_PERMISSION_DEFINITIONS.map((definition) => [
      definition.name,
      definition.risk,
    ]),
  );
  return created.value;
}

test("advertises the exact workspace-root path convention", async () => {
  await withWorkspace(async (workspace) => {
    const tools = await engine(workspace);
    for (const name of ["read_file", "list_directory", "search_text"]) {
      const descriptor = tools.descriptors.find(
        (candidate) => candidate.name === name,
      );
      assert.ok(descriptor !== undefined);
      const pathField = descriptor?.input.fields.find(
        (field) => field.name === "path",
      );
      assert.deepEqual(
        pathField === undefined
          ? undefined
          : Object.freeze({
              description: pathField.description,
              required: pathField.required,
            }),
        Object.freeze({
          description:
            'Workspace-relative path. Use "." for the workspace root.',
          required: true,
        }),
      );
    }
  });
});

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
    createBuiltinToolEngine("relative", undefined, toolPlatform()),
    { ok: false, error: { kind: "invalidRoot" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(
      Object.freeze({ root: path.resolve(".") }),
      undefined,
      toolPlatform(),
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
    createBuiltinToolEngine(forgedPrototype, undefined, toolPlatform()),
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
    createBuiltinToolEngine(boundary.value, undefined, toolPlatform()),
    { ok: false, error: { kind: "invalidReadPolicy" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(boundary.value, policy.value, {
      mutationCommitter: toolPlatform().mutationCommitter,
      namespaceCommitter: toolPlatform().namespaceCommitter,
      processPrograms: Object.freeze({}) as never,
      processRunner,
    }),
    { ok: false, error: { kind: "invalidPlatform" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(boundary.value, policy.value, {
      mutationCommitter: Object.freeze({}) as never,
      namespaceCommitter: toolPlatform().namespaceCommitter,
      processPrograms: toolPlatform().processPrograms,
      processRunner,
    }),
    { ok: false, error: { kind: "invalidPlatform" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(boundary.value, policy.value, {
      mutationCommitter: toolPlatform().mutationCommitter,
      namespaceCommitter: Object.freeze({
        commit: toolPlatform().namespaceCommitter.commit,
      }) as never,
      processPrograms: toolPlatform().processPrograms,
      processRunner,
    }),
    { ok: false, error: { kind: "invalidPlatform" } },
  );
  assert.deepEqual(
    createBuiltinToolEngine(boundary.value, policy.value, {
      mutationCommitter: toolPlatform().mutationCommitter,
      namespaceCommitter: Object.freeze({}) as never,
      processPrograms: toolPlatform().processPrograms,
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
  const planned = await tools.plan(prepared.value, cancellation);
  assert.ok(planned.ok);
  const result = await tools.execute(planned.value, cancellation);
  assert.ok(result.ok);
  return result.value;
}

async function preparePlan(
  tools: ToolEngine,
  name: string,
  input: unknown,
): Promise<Readonly<{
  planned: PlannedToolCall;
  prepared: PreparedToolCall;
}>> {
  const value = structuredValueFromUnknown(input);
  assert.ok(value.ok && value.value instanceof StructuredObject);
  const prepared = tools.prepare("call-plan-" + name, name, value.value);
  assert.ok(prepared.ok);
  const planned = await tools.plan(prepared.value, cancellation);
  assert.ok(planned.ok);
  return Object.freeze({ planned: planned.value, prepared: prepared.value });
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

async function pathMissing(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return false;
  } catch (cause: unknown) {
    if (
      cause !== null &&
      typeof cause === "object" &&
      (cause as Readonly<{ code?: unknown }>).code === "ENOENT"
    ) {
      return true;
    }
    throw cause;
  }
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
    const created = await execute(
      tools,
      "apply_patch",
      patchInput("notes.txt", "", "α € 😀\nbeta\n"),
    );
    assert.equal(created.result.status, "success");

    const read = await execute(tools, "read_file", { path: "notes.txt" });
    assert.equal(output(read).get("startLine"), 1);
    assert.equal(output(read).get("lineCount"), 2);
    assert.equal(output(read).get("totalLines"), 2);
    assert.equal(output(read).get("hasMore"), false);
    assert.equal(output(read).get("text"), "α € 😀\nbeta\n");

    const replaced = await execute(
      tools,
      "apply_patch",
      patchInput("notes.txt", "beta", "owned € 😀"),
    );
    assert.equal(replaced.result.status, "success");
    assert.equal(
      await readFile(path.join(workspace, "notes.txt"), { encoding: "utf8" }),
      "α € 😀\nowned € 😀\n",
    );

    const multiCreated = await execute(
      tools,
      "apply_patch",
      patchInput("multi.txt", "", "alpha beta gamma"),
    );
    assert.equal(multiCreated.result.status, "success");
    const multiPatched = await execute(tools, "apply_patch", {
      hunks: [
        { newText: "ALPHA", oldText: "alpha" },
        { newText: "GAMMA", oldText: "gamma" },
      ],
      path: "multi.txt",
    });
    assert.equal(multiPatched.result.status, "success");
    assert.equal(output(multiPatched).get("effect"), "updated");
    assert.equal(output(multiPatched).get("hunks"), 2);
    assert.equal(
      await readFile(path.join(workspace, "multi.txt"), { encoding: "utf8" }),
      "ALPHA beta GAMMA",
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

test("creates directories and applies the platform namespace boundary", async () => {
  await withWorkspace(async (workspace) => {
    const tools = await engine(workspace);
    const creation = await preparePlan(tools, "manage_path", {
      request: { operation: "create_directory", path: "archive" },
    });
    assert.equal(creation.planned.approvalRequired, true);
    assert.equal(
      creation.planned.approvalPreview.includes(
        'operation="create_directory"',
      ),
      true,
    );
    assert.equal(
      creation.planned.approvalPreview.includes('path="archive"'),
      true,
    );
    const created = await tools.execute(creation.planned, cancellation);
    assert.ok(created.ok);
    assert.equal(created.value.result.status, "success");
    assert.equal(output(created.value).get("effect"), "directory_created");

    await writeFile(path.join(workspace, "source.txt"), "owned", {
      encoding: "utf8",
      flag: "wx",
    });
    const movement = await preparePlan(tools, "manage_path", {
      request: {
        destination: "archive/source.txt",
        operation: "move",
        path: "source.txt",
      },
    });
    if (platform === "linux") {
      assert.equal(movement.planned.approvalRequired, false);
      assert.equal(movement.planned.approvalPreview, "");
      const moved = await tools.execute(movement.planned, cancellation);
      assert.ok(moved.ok);
      assert.equal(moved.value.result.status, "failure");
      assert.equal(output(moved.value).get("error"), "unsupported");
      assert.equal(
        await readFile(path.join(workspace, "source.txt"), {
          encoding: "utf8",
        }),
        "owned",
      );
      assert.equal(
        await pathMissing(path.join(workspace, "archive", "source.txt")),
        true,
      );

      const fileRemoval = await preparePlan(tools, "manage_path", {
        request: { operation: "remove", path: "source.txt" },
      });
      assert.equal(fileRemoval.planned.approvalRequired, false);
      assert.equal(fileRemoval.planned.approvalPreview, "");
      const removedFile = await tools.execute(
        fileRemoval.planned,
        cancellation,
      );
      assert.ok(removedFile.ok);
      assert.equal(removedFile.value.result.status, "failure");
      assert.equal(output(removedFile.value).get("error"), "unsupported");

      const directoryRemoval = await preparePlan(tools, "manage_path", {
        request: { operation: "remove", path: "archive" },
      });
      assert.equal(directoryRemoval.planned.approvalRequired, false);
      assert.equal(directoryRemoval.planned.approvalPreview, "");
      const removedDirectory = await tools.execute(
        directoryRemoval.planned,
        cancellation,
      );
      assert.ok(removedDirectory.ok);
      assert.equal(removedDirectory.value.result.status, "failure");
      assert.equal(
        output(removedDirectory.value).get("error"),
        "unsupported",
      );
      assert.equal(await pathMissing(path.join(workspace, "archive")), false);
      return;
    }
    assert.equal(movement.planned.approvalRequired, true);
    for (const field of [
      'operation="move"',
      'objectKind="file"',
      'path="source.txt"',
      'destination="archive/source.txt"',
    ]) {
      assert.equal(movement.planned.approvalPreview.includes(field), true);
    }
    const moved = await tools.execute(movement.planned, cancellation);
    assert.ok(moved.ok);
    assert.equal(moved.value.result.status, "success");
    assert.equal(output(moved.value).get("effect"), "moved");
    assert.equal(await pathMissing(path.join(workspace, "source.txt")), true);
    assert.equal(
      await readFile(path.join(workspace, "archive", "source.txt"), {
        encoding: "utf8",
      }),
      "owned",
    );

    const fileRemoval = await preparePlan(tools, "manage_path", {
      request: { operation: "remove", path: "archive/source.txt" },
    });
    assert.equal(fileRemoval.planned.approvalRequired, true);
    assert.equal(
      fileRemoval.planned.approvalPreview.includes('objectKind="file"'),
      true,
    );
    const removedFile = await tools.execute(
      fileRemoval.planned,
      cancellation,
    );
    assert.ok(removedFile.ok);
    assert.equal(output(removedFile.value).get("effect"), "removed");

    const directoryRemoval = await preparePlan(tools, "manage_path", {
      request: { operation: "remove", path: "archive" },
    });
    assert.equal(directoryRemoval.planned.approvalRequired, true);
    assert.equal(
      directoryRemoval.planned.approvalPreview.includes(
        'objectKind="directory"',
      ),
      true,
    );
    const removedDirectory = await tools.execute(
      directoryRemoval.planned,
      cancellation,
    );
    assert.ok(removedDirectory.ok);
    assert.equal(output(removedDirectory.value).get("effect"), "removed");
    assert.equal(await pathMissing(path.join(workspace, "archive")), true);
  });
});

test("rejects unsupported namespace operations before observation and approval", async () => {
  await withWorkspace(async (workspace) => {
    const boundary = await WorkspaceBoundary.create(
      workspace,
      workspaceProtection,
    );
    assert.ok(boundary.ok);
    const policy = await WorkspaceReadPolicy.load(boundary.value, platform);
    assert.ok(policy.ok);
    const linuxCommitter = PlatformWorkspaceNamespaceCommitter.create(
      "linux",
      "x64",
    );
    assert.ok(linuxCommitter.ok);
    const current = toolPlatform();
    const created = createBuiltinToolEngine(boundary.value, policy.value, {
      mutationCommitter: current.mutationCommitter,
      namespaceCommitter: linuxCommitter.value,
      processPrograms: current.processPrograms,
      processRunner: current.processRunner,
    });
    assert.ok(created.ok);

    await rm(workspace, { force: true, recursive: true });
    for (const request of [
      {
        destination: "missing/destination.txt",
        operation: "move",
        path: "missing/source.txt",
      },
      { operation: "remove", path: "missing/source.txt" },
    ]) {
      const rejected = await preparePlan(created.value, "manage_path", {
        request,
      });
      assert.equal(rejected.planned.approvalRequired, false);
      assert.equal(rejected.planned.approvalPreview, "");
      const settled = await created.value.execute(
        rejected.planned,
        cancellation,
      );
      assert.ok(settled.ok);
      assert.equal(settled.value.result.status, "failure");
      assert.equal(output(settled.value).get("error"), "unsupported");
    }
  });
});

test("rejects invalid namespace plans before approval and stale effects at commit", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "nonempty"));
    await writeFile(path.join(workspace, "nonempty", "child.txt"), "child", {
      encoding: "utf8",
      flag: "wx",
    });
    await mkdir(path.join(workspace, "tree"));
    await writeFile(path.join(workspace, "source.txt"), "original", {
      encoding: "utf8",
      flag: "wx",
    });
    await writeFile(path.join(workspace, "occupied.txt"), "occupied", {
      encoding: "utf8",
      flag: "wx",
    });
    const tools = await engine(workspace);

    for (const request of [
      { operation: "create_directory", path: "missing/child" },
      {
        destination: "occupied.txt",
        operation: "move",
        path: "source.txt",
      },
      { operation: "remove", path: "nonempty" },
      {
        destination: "tree/descendant",
        operation: "move",
        path: "tree",
      },
    ]) {
      const rejected = await preparePlan(tools, "manage_path", { request });
      assert.equal(rejected.planned.approvalRequired, false);
      assert.equal(rejected.planned.approvalPreview, "");
      const settled = await tools.execute(rejected.planned, cancellation);
      assert.ok(settled.ok);
      assert.equal(settled.value.result.status, "failure");
    }

    const stale = await preparePlan(tools, "manage_path", {
      request: {
        destination: "moved.txt",
        operation: "move",
        path: "source.txt",
      },
    });
    if (platform === "linux") {
      assert.equal(stale.planned.approvalRequired, false);
      assert.equal(stale.planned.approvalPreview, "");
      const unsupported = await tools.execute(stale.planned, cancellation);
      assert.ok(unsupported.ok);
      assert.equal(unsupported.value.result.status, "failure");
      assert.equal(output(unsupported.value).get("error"), "unsupported");
      assert.equal(
        await readFile(path.join(workspace, "source.txt"), {
          encoding: "utf8",
        }),
        "original",
      );
      assert.equal(await pathMissing(path.join(workspace, "moved.txt")), true);
      return;
    }
    assert.equal(stale.planned.approvalRequired, true);
    await rename(
      path.join(workspace, "source.txt"),
      path.join(workspace, "preserved.txt"),
    );
    await writeFile(path.join(workspace, "source.txt"), "replacement", {
      encoding: "utf8",
      flag: "wx",
    });
    const staleSettlement = await tools.execute(stale.planned, cancellation);
    assert.ok(staleSettlement.ok);
    assert.equal(staleSettlement.value.result.status, "failure");
    assert.equal(output(staleSettlement.value).get("error"), "conflict");
    assert.equal(
      await readFile(path.join(workspace, "source.txt"), { encoding: "utf8" }),
      "replacement",
    );
    assert.equal(
      await readFile(path.join(workspace, "preserved.txt"), {
        encoding: "utf8",
      }),
      "original",
    );
    assert.equal(await pathMissing(path.join(workspace, "moved.txt")), true);
  });
});

test("projects bounded read_file lines through one unchanged read capability", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "lines.txt"),
      "alpha\r\nbeta\ngamma\ndelta",
      { encoding: "utf8", flag: "wx" },
    );
    const tools = await engine(workspace);
    const readDescriptor = tools.descriptors.find(
      (tool) => tool.name === "read_file",
    );
    assert.ok(readDescriptor !== undefined);
    assert.deepEqual(
      readDescriptor.input.fields.map((field) => [
        field.name,
        field.required,
        field.schema.kind,
      ]),
      [
        ["path", true, "string"],
        ["startLine", false, "integer"],
        ["lineCount", false, "integer"],
      ],
    );

    const selected = await execute(tools, "read_file", {
      lineCount: 2,
      path: "lines.txt",
      startLine: 2,
    });
    assert.equal(selected.result.status, "success");
    assert.equal(output(selected).get("text"), "beta\ngamma\n");
    assert.equal(output(selected).get("startLine"), 2);
    assert.equal(output(selected).get("lineCount"), 2);
    assert.equal(output(selected).get("totalLines"), 4);
    assert.equal(output(selected).get("hasMore"), true);

    const beyond = await execute(tools, "read_file", {
      lineCount: 1,
      path: "lines.txt",
      startLine: 99,
    });
    assert.equal(beyond.result.status, "success");
    assert.equal(output(beyond).get("text"), "");
    assert.equal(output(beyond).get("startLine"), 5);
    assert.equal(output(beyond).get("lineCount"), 0);
    assert.equal(output(beyond).get("totalLines"), 4);
    assert.equal(output(beyond).get("hasMore"), false);

    for (const input of [
      { path: "lines.txt", startLine: 0 },
      {
        lineCount: BUILTIN_TOOL_LIMITS.fileRangeLines + 1,
        path: "lines.txt",
      },
      { path: "lines.txt", startLine: 1.5 },
    ]) {
      const structured = structuredValueFromUnknown(input);
      assert.ok(structured.ok);
      assert.ok(structured.value instanceof StructuredObject);
      const prepared = tools.prepare(
        "invalid-read-file",
        "read_file",
        structured.value,
      );
      assert.deepEqual(prepared, {
        error: { kind: "invalidInput" },
        ok: false,
      });
    }
  });
});

test("observes canonical successful read identities only when opted in", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(path.join(workspace, "notes.txt"), "alpha\n", {
      encoding: "utf8",
      flag: "wx",
    });
    const observer = new EvaluationReceiptRecorder();
    assert.ok(observer.start(10).ok);
    const tools = await engine(workspace, processRunner, observer);

    assert.equal(
      (await execute(tools, "read_file", { path: "notes.txt" })).result.status,
      "success",
    );
    assert.equal(
      (
        await execute(tools, "read_file", {
          lineCount: 1,
          path: "./notes.txt",
          startLine: 1,
        })
      ).result.status,
      "success",
    );
    assert.equal(
      (await execute(tools, "read_file", { path: "missing.txt" })).result.status,
      "failure",
    );
    assert.equal(
      (await execute(tools, "search_text", { path: ".", query: "alpha" }))
        .result.status,
      "success",
    );
    assert.equal(
      (await execute(tools, "search_text", { path: ".", query: "alpha" }))
        .result.status,
      "success",
    );

    const receipt = observer.finish(20);
    assert.ok(receipt.ok);
    assert.equal(receipt.value.repeatedReads, 2);
    assert.equal(receipt.value.toolCalls, 0);
  });
});

test("plans concrete bounded creation and replacement effects", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "notes.txt"),
      "alpha\nbeta\ngamma\n",
      { encoding: "utf8", flag: "wx" },
    );
    const tools = await engine(workspace);

    const creation = await preparePlan(
      tools,
      "apply_patch",
      patchInput(path.join("docs", "new.txt"), "", "first\nsecond\n"),
    );
    assert.equal(creation.planned.approvalRequired, false);
    assert.equal(creation.planned.approvalPreview, "");
    const failedCreation = await tools.execute(
      creation.planned,
      cancellation,
    );
    assert.ok(failedCreation.ok);
    assert.equal(failedCreation.value.result.status, "failure");
    assert.equal(output(failedCreation.value).get("error"), "notFound");

    await mkdir(path.join(workspace, "docs"));
    const availableCreation = await preparePlan(
      tools,
      "apply_patch",
      patchInput(path.join("docs", "new.txt"), "", "first\nsecond\n"),
    );
    assert.equal(availableCreation.planned.approvalRequired, true);
    assert.equal(
      availableCreation.planned.approvalPreview.startsWith(
        "Path: docs/new.txt\n",
      ),
      true,
    );
    assert.equal(
      availableCreation.planned.approvalPreview.includes("+ first\n+ second"),
      true,
    );
    assert.equal(
      /observed|Digest|patchFields|patchHunks/u.test(
        availableCreation.planned.approvalPreview,
      ),
      false,
    );

    const mixedCreation = await preparePlan(
      tools,
      "apply_patch",
      patchInput(
        path.join("docs", "mixed.txt"),
        "",
        "one\r\ntwo\rthree\nfour",
      ),
    );
    assert.equal(mixedCreation.planned.approvalRequired, true);
    assert.equal(
      mixedCreation.planned.approvalPreview.includes(
        "+ one\n+ two\n+ three\n+ four",
      ),
      true,
    );

    const replacement = await preparePlan(
      tools,
      "apply_patch",
      patchInput("notes.txt", "beta", "owned\nvalue"),
    );
    assert.equal(replacement.planned.approvalRequired, true);
    assert.equal(
      replacement.planned.approvalPreview.startsWith("Path: notes.txt\n"),
      true,
    );
    assert.equal(
      replacement.planned.approvalPreview.includes(
        "- beta\n+ owned\n+ value",
      ),
      true,
    );
    assert.equal(
      /Digest|effect=|operation=|removedLines|addedLines/u.test(
        replacement.planned.approvalPreview,
      ),
      false,
    );

    await writeFile(
      path.join(workspace, "mixed-lines.txt"),
      "alpha\r\nbeta\rgamma\ndelta\rremove-a\rremove-b\r\nremove-c\nremove-d",
      { encoding: "utf8", flag: "wx" },
    );
    const mixedReplacement = await preparePlan(
      tools,
      "apply_patch",
      patchInput(
        "mixed-lines.txt",
        "remove-a\rremove-b\r\nremove-c\nremove-d",
        "insert-a\rinsert-b\r\ninsert-c\ninsert-d",
      ),
    );
    assert.equal(mixedReplacement.planned.approvalRequired, true);
    assert.equal(
      mixedReplacement.planned.approvalPreview.includes(
        "- remove-a\n- remove-b\n- remove-c\n- remove-d",
      ),
      true,
    );
    assert.equal(
      mixedReplacement.planned.approvalPreview.includes(
        "+ insert-a\n+ insert-b\n+ insert-c\n+ insert-d",
      ),
      true,
    );
  });
});

test("renders every patch hunk as independently prefixed human diff rows", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "delimiters.txt"),
      "alpha\ninsert:\nomega\nmiddle\n@@ hunk 2 @@\ntail",
      { encoding: "utf8", flag: "wx" },
    );
    const tools = await engine(workspace);
    const planned = await preparePlan(tools, "apply_patch", {
      hunks: [
        {
          oldText: "alpha\ninsert:\nomega",
          newText: "first\n@@ hunk 2 @@\nreplacement",
        },
        {
          oldText: "middle\n@@ hunk 2 @@\ntail",
          newText: "\ninsert:\n",
        },
      ],
      path: "delimiters.txt",
    });

    assert.equal(planned.planned.approvalRequired, true);
    const rows = planned.planned.approvalPreview.split("\n");
    assert.equal(rows.at(0), "Path: delimiters.txt");
    assert.equal(
      rows.slice(1).every((row) =>
        row.startsWith("- ") || row.startsWith("+ ")
      ),
      true,
    );
    assert.equal(rows.includes("- insert:"), true);
    assert.equal(rows.includes("+ insert:"), true);
    assert.equal(rows.includes("- @@ hunk 2 @@"), true);
    assert.equal(rows.includes("+ @@ hunk 2 @@"), true);
    assert.deepEqual(
      projectPatchMutationPreview(planned.planned.approvalPreview),
      {
        diff: rows.slice(1).join("\n"),
        path: "delimiters.txt",
      },
    );
  });
});

test("rejects stale content, target creation, and parent replacement", async () => {
  await withWorkspace(async (workspace, outside) => {
    await mkdir(path.join(workspace, "parent"));
    await writeFile(path.join(workspace, "replace.txt"), "before", {
      encoding: "utf8",
      flag: "wx",
    });
    const tools = await engine(workspace);

    const replacement = await preparePlan(
      tools,
      "apply_patch",
      patchInput("replace.txt", "before", "after"),
    );
    await writeFile(path.join(workspace, "replace.txt"), "external", {
      encoding: "utf8",
      flag: "w",
    });
    const staleReplacement = await tools.execute(
      replacement.planned,
      cancellation,
    );
    assert.ok(staleReplacement.ok);
    assert.equal(staleReplacement.value.result.status, "failure");
    assert.equal(output(staleReplacement.value).get("error"), "conflict");
    assert.equal(
      await readFile(path.join(workspace, "replace.txt"), {
        encoding: "utf8",
      }),
      "external",
    );

    await writeFile(path.join(workspace, "identity.txt"), "same", {
      encoding: "utf8",
      flag: "wx",
    });
    const identitySwap = await preparePlan(
      tools,
      "apply_patch",
      patchInput("identity.txt", "same", "changed"),
    );
    await rename(
      path.join(workspace, "identity.txt"),
      path.join(workspace, "original-identity.txt"),
    );
    await writeFile(path.join(workspace, "identity.txt"), "same", {
      encoding: "utf8",
      flag: "wx",
    });
    const staleIdentity = await tools.execute(
      identitySwap.planned,
      cancellation,
    );
    assert.ok(staleIdentity.ok);
    assert.equal(output(staleIdentity.value).get("error"), "conflict");
    assert.equal(
      await readFile(path.join(workspace, "identity.txt"), {
        encoding: "utf8",
      }),
      "same",
    );
    assert.equal(
      await readFile(path.join(workspace, "original-identity.txt"), {
        encoding: "utf8",
      }),
      "same",
    );

    const appeared = await preparePlan(
      tools,
      "apply_patch",
      patchInput(path.join("parent", "appeared.txt"), "", "approved"),
    );
    await writeFile(
      path.join(workspace, "parent", "appeared.txt"),
      "external",
      { encoding: "utf8", flag: "wx" },
    );
    const staleAbsence = await tools.execute(appeared.planned, cancellation);
    assert.ok(staleAbsence.ok);
    assert.equal(output(staleAbsence.value).get("error"), "conflict");
    assert.equal(
      await readFile(path.join(workspace, "parent", "appeared.txt"), {
        encoding: "utf8",
      }),
      "external",
    );

    const parentSwap = await preparePlan(
      tools,
      "apply_patch",
      patchInput(
        path.join("parent", "new.txt"),
        "",
        "must stay contained",
      ),
    );
    await rename(
      path.join(workspace, "parent"),
      path.join(workspace, "moved-parent"),
    );
    await symlink(outside, path.join(workspace, "parent"), "junction");
    const staleParent = await tools.execute(parentSwap.planned, cancellation);
    assert.ok(staleParent.ok);
    assert.equal(staleParent.value.result.status, "failure");
    assert.equal(output(staleParent.value).get("error"), "conflict");
    assert.equal(await pathMissing(path.join(outside, "new.txt")), true);
    assert.equal(
      await pathMissing(path.join(workspace, "moved-parent", "new.txt")),
      true,
    );
  });
});

test("bounds mutation previews and skips approval when no effect can be planned", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(path.join(workspace, "duplicate.txt"), "x x", {
      encoding: "utf8",
      flag: "wx",
    });
    const tools = await engine(workspace);
    const large = await preparePlan(
      tools,
      "apply_patch",
      patchInput("large.txt", "", "line\n".repeat(40_000)),
    );
    assert.equal(large.planned.approvalRequired, true);
    assert.ok(
      large.planned.approvalPreview.length <=
        WORKSPACE_MUTATION_PREVIEW_CODE_UNITS,
    );
    assert.equal(
      large.planned.approvalPreview.startsWith("Path: large.txt\n"),
      true,
    );
    assert.equal(
      large.planned.approvalPreview.includes("code units omitted"),
      true,
    );
    assert.equal(
      /patchFields|patchHunks|Digest|addedLines/u.test(
        large.planned.approvalPreview,
      ),
      false,
    );

    const ambiguous = await preparePlan(
      tools,
      "apply_patch",
      patchInput("duplicate.txt", "x", "y"),
    );
    assert.equal(ambiguous.planned.approvalRequired, false);
    assert.equal(ambiguous.planned.approvalPreview, "");
    const failed = await tools.execute(ambiguous.planned, cancellation);
    assert.ok(failed.ok);
    assert.equal(output(failed.value).get("error"), "conflict");
    assert.equal(
      await readFile(path.join(workspace, "duplicate.txt"), {
        encoding: "utf8",
      }),
      "x x",
    );
  });
});

test("fits the maximum admitted hunk batch in the bounded approval preview", () => {
  const hunks = Object.freeze(
    Array.from({ length: 32 }, (_value, index) =>
      Object.freeze({
        newText: String(index).padStart(2, "0") + "y".repeat(8_178),
        oldText: String(index).padStart(2, "0") + "x".repeat(8_178),
      }),
    ),
  );
  const preview = patchMutationPreview({
    effect: "update",
    hunks,
    path: "\\".repeat(TEXT_PATCH_LIMITS.pathCodeUnits),
  });

  assert.ok(preview !== undefined);
  assert.ok(preview.length <= WORKSPACE_MUTATION_PREVIEW_CODE_UNITS);
  assert.equal(preview.startsWith("Path: " + "\\".repeat(32)), true);
  assert.equal(preview.includes("- [8180 omitted]"), true);
  assert.equal(preview.includes("+ [8180 omitted]"), true);
  assert.equal(preview.split("\n").length, 65);
});

test("shows only changed logical rows from exact retained patch context", () => {
  const preview = patchMutationPreview({
    effect: "update",
    hunks: Object.freeze([
      Object.freeze({
        newText: "  background: green;\n  color: #e8eaed;",
        oldText: "  background: #0f1115;\n  color: #e8eaed;",
      }),
      Object.freeze({
        newText: "<h1>Hello World!</h1>",
        oldText: "<h1>Hello World</h1>",
      }),
      Object.freeze({
        newText: "</body>\n</html>",
        oldText: "</body>\n<!-- Fine del documento -->\n</html>",
      }),
    ]),
    path: "index.html",
  });

  assert.ok(preview !== undefined);
  assert.equal(
    preview,
    "Path: index.html\n" +
      "-   background: #0f1115;\n" +
      "+   background: green;\n" +
      "- <h1>Hello World</h1>\n" +
      "+ <h1>Hello World!</h1>\n" +
      "- <!-- Fine del documento -->",
  );
  assert.equal(preview.includes("color: #e8eaed"), false);
  assert.equal(preview.includes("</body>"), false);
  assert.equal(preview.includes("</html>"), false);
});

test("keeps compacted HTML context inside the authorized committed patch", async () => {
  await withWorkspace(async (workspace) => {
    const source = [
      "<style>",
      "body {",
      "  background: #0f1115;",
      "  color: #e8eaed;",
      "}",
      "</style>",
      "<body>",
      "<h1>Hello World</h1>",
      "</body>",
      "<!-- Fine del documento -->",
      "</html>",
    ].join("\n");
    await writeFile(path.join(workspace, "index.html"), source, {
      encoding: "utf8",
      flag: "wx",
    });
    const tools = await engine(workspace);
    const planned = await preparePlan(tools, "apply_patch", {
      hunks: [
        {
          newText: "  background: green;\n  color: #e8eaed;",
          oldText: "  background: #0f1115;\n  color: #e8eaed;",
        },
        {
          newText: "<h1>Hello World!</h1>",
          oldText: "<h1>Hello World</h1>",
        },
        {
          newText: "</body>\n</html>",
          oldText: "</body>\n<!-- Fine del documento -->\n</html>",
        },
      ],
      path: "index.html",
    });

    assert.equal(planned.planned.approvalRequired, true);
    assert.equal(planned.planned.approvalPreview.includes("</body>"), false);
    assert.equal(planned.planned.approvalPreview.includes("</html>"), false);
    assert.equal(
      planned.planned.approvalPreview.includes("- <!-- Fine del documento -->"),
      true,
    );
    const executed = await tools.execute(planned.planned, cancellation);
    assert.ok(executed.ok);
    assert.equal(executed.value.result.status, "success");
    assert.equal(
      await readFile(path.join(workspace, "index.html"), {
        encoding: "utf8",
      }),
      source
        .replace("background: #0f1115", "background: green")
        .replace("Hello World</h1>", "Hello World!</h1>")
        .replace("\n<!-- Fine del documento -->", ""),
    );
  });
});

test("compacts context per hunk without hiding separator or partial-line changes", () => {
  const preview = patchMutationPreview({
    effect: "update",
    hunks: Object.freeze([
      Object.freeze({
        newText: "same\nadded\nend",
        oldText: "same\nend",
      }),
      Object.freeze({
        newText: "same\nend",
        oldText: "same\nremoved\nend",
      }),
      Object.freeze({
        newText: "same\nnew\nend",
        oldText: "same\r\nold\nend",
      }),
      Object.freeze({
        newText: "prefix new suffix",
        oldText: "prefix old suffix",
      }),
    ]),
    path: "context.txt",
  });

  assert.equal(
    preview,
    "Path: context.txt\n" +
      "+ added\n" +
      "- removed\n" +
      "- same\n" +
      "- old\n" +
      "+ same\n" +
      "+ new\n" +
      "- prefix old suffix\n" +
      "+ prefix new suffix",
  );
  assert.equal(
    patchMutationPreview({
      effect: "update",
      hunks: Object.freeze([
        Object.freeze({ newText: "unchanged", oldText: "unchanged" }),
      ]),
      path: "invalid.txt",
    }),
    undefined,
  );
});

test("does not render an empty direction row for a terminal separator", () => {
  assert.equal(
    patchMutationPreview({
      effect: "create",
      hunks: Object.freeze([
        Object.freeze({ newText: "first\nsecond\n", oldText: "" }),
      ]),
      path: "created.txt",
    }),
    "Path: created.txt\n+ first\n+ second",
  );
});

test("preserves terminal separator ownership in both patch directions", () => {
  assert.equal(
    patchMutationPreview({
      effect: "update",
      hunks: Object.freeze([
        Object.freeze({ newText: "line", oldText: "line\n" }),
      ]),
      path: "remove-lf.txt",
    }),
    "Path: remove-lf.txt\n- line\\n\n+ line",
  );
  assert.equal(
    patchMutationPreview({
      effect: "update",
      hunks: Object.freeze([
        Object.freeze({ newText: "line\n", oldText: "line" }),
      ]),
      path: "add-lf.txt",
    }),
    "Path: add-lf.txt\n- line\n+ line\\n",
  );
  assert.equal(
    patchMutationPreview({
      effect: "update",
      hunks: Object.freeze([
        Object.freeze({ newText: "line\n", oldText: "line\r\n" }),
      ]),
      path: "replace-crlf.txt",
    }),
    "Path: replace-crlf.txt\n- line\\r\\n\n+ line\\n",
  );
  assert.equal(
    patchMutationPreview({
      effect: "update",
      hunks: Object.freeze([
        Object.freeze({ newText: "line", oldText: "line\r" }),
      ]),
      path: "remove-cr.txt",
    }),
    "Path: remove-cr.txt\n- line\\r\n+ line",
  );
  assert.equal(
    patchMutationPreview({
      effect: "update",
      hunks: Object.freeze([
        Object.freeze({ newText: "line", oldText: "line\\n" }),
      ]),
      path: "literal-backslash.txt",
    }),
    "Path: literal-backslash.txt\n- line\\\\n\n+ line",
  );
});

test("renders empty creation and escapes non-line diff controls", () => {
  const empty = patchMutationPreview({
    effect: "create",
    hunks: Object.freeze([Object.freeze({ newText: "", oldText: "" })]),
    path: "empty.txt",
  });
  assert.equal(empty, "Path: empty.txt\n+ [empty file]");

  const escaped = patchMutationPreview({
    effect: "update",
    hunks: Object.freeze([
      Object.freeze({
        newText: "after\t\\value\u202E",
        oldText: "before\t\\value",
      }),
    ]),
    path: "controls.txt",
  });
  assert.equal(
    escaped,
    "Path: controls.txt\n- before\\t\\\\value\n" +
      "+ after\\t\\\\value\\u{202e}",
  );
  assert.equal(projectPatchMutationPreview("technical binding"), undefined);
  assert.equal(
    projectPatchMutationPreview("Path: file.txt\nnot a diff row"),
    undefined,
  );
});

test("rejects unsafe mutation text and unsupported observed files before approval", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "invalid.txt"),
      new Uint8Array([0xff, 0xfe]),
    );
    await writeFile(
      path.join(workspace, "nul-source.txt"),
      new Uint8Array([0x6f, 0x6c, 0x64, 0x00, 0x74, 0x61, 0x69, 0x6c]),
    );
    await writeFile(
      path.join(workspace, "oversized.txt"),
      "x".repeat(1_048_577),
      { encoding: "utf8", flag: "wx" },
    );
    const tools = await engine(workspace);

    for (const input of [
      patchInput("nul.txt", "", "nul\u0000content"),
      patchInput("surrogate.txt", "", "lone \ud800 surrogate"),
      patchInput("nul\u0000path.txt", "", "safe"),
      patchInput(
        "p".repeat(TEXT_PATCH_LIMITS.pathCodeUnits + 1),
        "",
        "safe",
      ),
      patchInput("\u2028".repeat(112), "", "safe"),
    ]) {
      const structured = structuredValueFromUnknown(input);
      assert.ok(structured.ok && structured.value instanceof StructuredObject);
      const prepared = tools.prepare(
        "call-unsafe",
        "apply_patch",
        structured.value,
      );
      assert.equal(prepared.ok, false);
    }

    const invalidUtf8 = await preparePlan(
      tools,
      "apply_patch",
      patchInput("invalid.txt", "old", "new"),
    );
    assert.equal(invalidUtf8.planned.approvalRequired, false);
    assert.equal(invalidUtf8.planned.approvalPreview, "");
    const failed = await tools.execute(invalidUtf8.planned, cancellation);
    assert.ok(failed.ok);
    assert.equal(output(failed.value).get("error"), "unsupported");
    const retained = await readFile(path.join(workspace, "invalid.txt"));
    assert.equal(retained.length, 2);
    assert.equal(retained.at(0), 0xff);
    assert.equal(retained.at(1), 0xfe);

    const nulSource = await preparePlan(
      tools,
      "apply_patch",
      patchInput("nul-source.txt", "old", "new"),
    );
    assert.equal(nulSource.planned.approvalRequired, false);
    assert.equal(nulSource.planned.approvalPreview, "");
    const unsupported = await tools.execute(nulSource.planned, cancellation);
    assert.ok(unsupported.ok);
    assert.equal(output(unsupported.value).get("error"), "unsupported");
    assert.deepEqual(
      Array.from(await readFile(path.join(workspace, "nul-source.txt"))),
      [0x6f, 0x6c, 0x64, 0x00, 0x74, 0x61, 0x69, 0x6c],
    );

    const oversized = await preparePlan(
      tools,
      "apply_patch",
      patchInput("oversized.txt", "x", "y"),
    );
    assert.equal(oversized.planned.approvalRequired, false);
    const limited = await tools.execute(oversized.planned, cancellation);
    assert.ok(limited.ok);
    assert.equal(output(limited.value).get("error"), "limit");
  });
});

test("rejects aggregate patch limits during structural preparation", async () => {
  await withWorkspace(async (workspace) => {
    const tools = await engine(workspace);
    const input = structuredValueFromUnknown({
      hunks: [
        {
          newText: "b",
          oldText: "a".repeat(BUILTIN_TOOL_LIMITS.fileCodeUnits),
        },
        {
          newText: "d",
          oldText: "c".repeat(BUILTIN_TOOL_LIMITS.fileCodeUnits),
        },
      ],
      path: ".",
    });
    assert.ok(input.ok && input.value instanceof StructuredObject);
    const oversized = tools.prepare(
      "call-aggregate-limit",
      "apply_patch",
      input.value,
    );

    assert.equal(oversized.ok, false);
    if (!oversized.ok) {
      assert.equal(oversized.error.kind, "invalidInput");
    }
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

    const created = await execute(
      tools,
      "apply_patch",
      patchInput("private/created.txt", "", "created without disclosure"),
    );
    assert.equal(created.result.status, "success");
    const replaced = await execute(
      tools,
      "apply_patch",
      patchInput(
        "private/report.txt",
        "private-secret",
        "updated without disclosure",
      ),
    );
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
      await execute(
        tools,
        "apply_patch",
        patchInput("duplicate.txt", "", "new"),
      ),
      await execute(
        tools,
        "apply_patch",
        patchInput("duplicate.txt", "x", "y"),
      ),
    ]) {
      assert.equal(execution.result.status, "failure");
    }
  });
});
