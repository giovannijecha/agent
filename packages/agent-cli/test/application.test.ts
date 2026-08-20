import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeEvent, StartedTurn } from "@agent/runtime";

import {
  ApplicationController,
  ApplicationError,
} from "../dist/application.js";

function configuredProviders() {
  return Object.freeze([
    Object.freeze({
      configured: true,
      id: "ollamaCloud" as const,
      presentation: Object.freeze({
        authentication: "owned credential",
        displayName: "Ollama Cloud",
        model: "qwen3-coder:480b-cloud",
      }),
      ready: true,
      selected: true,
    }),
  ]);
}

function configuredProviderWithoutModel() {
  return Object.freeze([
    Object.freeze({
      configured: true,
      id: "ollamaCloud" as const,
      presentation: Object.freeze({
        authentication: "owned credential",
        displayName: "Ollama Cloud",
        model: undefined,
      }),
      ready: false,
      selected: true,
    }),
  ]);
}

function unconfiguredProviders() {
  return Object.freeze([
    Object.freeze({
      configured: false,
      id: "ollamaCloud" as const,
      presentation: Object.freeze({
        authentication: "owned credential",
        displayName: "Ollama Cloud",
        model: undefined,
      }),
      ready: false,
      selected: false,
    }),
  ]);
}

function started(
  turnId: number,
  content: string,
  historyParentNodeId = 0,
): StartedTurn {
  return Object.freeze({
    historyParentNodeId,
    turnId,
    user: Object.freeze({ content }),
  }) as unknown as StartedTurn;
}

function completed(turnId: number, content: string): RuntimeEvent<string> {
  return Object.freeze({
    assistant: Object.freeze({ content }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId,
  }) as unknown as RuntimeEvent<string>;
}

function reduceInput(application: ApplicationController, input: string) {
  return application.feed(input);
}

test("blocks no-runtime input without adding transcript or echoing it", () => {
  const application = new ApplicationController(false);
  const privateText = "private no-provider request";
  const submission = reduceInput(application, privateText + "\r");

  assert.deepEqual(submission.effects, []);

  assert.equal(application.hasTranscript, false);
  assert.equal(application.transcriptText(), "");
  assert.equal(application.notice.join("\n").includes(privateText), false);
});

test("never presents a provider without an executable runtime", () => {
  const application = new ApplicationController(false, configuredProviders());

  const result = reduceInput(application, "/models\r");

  assert.deepEqual(result.effects, []);
  assert.equal(application.provider, undefined);
  assert.deepEqual(application.notice, [
    "No authenticated providers. Exit and run agent auth first.",
  ]);
  assert.ok(application.noticeToken !== undefined);
});

test("stages the authenticated provider before loading one exact catalog", () => {
  const application = new ApplicationController(
    true,
    configuredProviderWithoutModel(),
  );

  const opened = reduceInput(application, "/models\r");
  assert.deepEqual(opened.effects, []);
  assert.deepEqual(
    application.projectModelProviderMenu()?.items.map((provider) => [
      provider.id,
      provider.selected,
    ]),
    [["ollamaCloud", true]],
  );

  const confirmed = reduceInput(application, "\r");
  assert.deepEqual(confirmed.effects, [
    { id: "ollamaCloud", kind: "loadModels" },
  ]);
  assert.equal(application.projectModelProviderMenu(), undefined);
});

test("requires external authentication and selects provider-model atomically", () => {
  const application = new ApplicationController(true, unconfiguredProviders());

  assert.deepEqual(reduceInput(application, "private task\r").effects, []);
  assert.deepEqual(application.notice, [
    "No provider and model are selected. Use /models first.",
  ]);
  assert.deepEqual(reduceInput(application, "/models\r").effects, []);
  assert.deepEqual(application.notice, [
    "No authenticated providers. Exit and run agent auth first.",
  ]);

  const authenticated = new ApplicationController(
    true,
    configuredProviderWithoutModel(),
  );
  assert.deepEqual(reduceInput(authenticated, "/models\r\r").effects, [
    { id: "ollamaCloud", kind: "loadModels" },
  ]);
  assert.ok(
    authenticated.modelsLoaded("ollamaCloud", [
      { cost: "cloud", id: "library/qwen3-coder:480b-cloud", selected: false },
    ]).ok,
  );
  assert.deepEqual(authenticated.projectModelMenu(), {
    items: [{ cost: "cloud", id: "library/qwen3-coder:480b-cloud", selected: false }],
    providerName: "Ollama Cloud",
    selectedIndex: 0,
  });
  assert.deepEqual(reduceInput(authenticated, "\r").effects, [
    {
      kind: "selectProviderModel",
      modelId: "library/qwen3-coder:480b-cloud",
      providerId: "ollamaCloud",
    },
  ]);
  const ready = configuredProviderWithoutModel().map((provider) => ({
    ...provider,
    presentation: {
      ...provider.presentation,
      model: "library/qwen3-coder:480b-cloud",
    },
    ready: true,
  }));
  assert.ok(
    authenticated.providerModelSelected(
      ready,
      "ollamaCloud",
      "library/qwen3-coder:480b-cloud",
    ).ok,
  );
  assert.equal(
    authenticated.provider?.model,
    "library/qwen3-coder:480b-cloud",
  );
  assert.deepEqual(reduceInput(authenticated, "private task\r").effects, [
    { effort: "off", kind: "startTurn", text: "private task" },
  ]);
});

test("preserves the settled provider-model pair through selector cancellation and failure", () => {
  const application = new ApplicationController(true, configuredProviders());
  const expected = application.provider;

  reduceInput(application, "/models\r");
  application.feed("\u001B", 0, undefined, true);
  assert.deepEqual(application.provider, expected);
  assert.equal(application.projectModelProviderMenu(), undefined);

  assert.deepEqual(reduceInput(application, "/models\r\r").effects, [
    { id: "ollamaCloud", kind: "loadModels" },
  ]);
  assert.ok(application.modelsLoaded("ollamaCloud", [
    { cost: "cloud", id: "qwen3-coder:480b-cloud", selected: true },
    { cost: "cloud", id: "glm-4.7:cloud", selected: false },
  ]).ok);
  application.feed("\u001B", 0, undefined, true);
  assert.deepEqual(application.provider, expected);
  assert.equal(application.projectModelMenu(), undefined);

  assert.deepEqual(reduceInput(application, "/models\r\r").effects, [
    { id: "ollamaCloud", kind: "loadModels" },
  ]);
  application.providerOperationFailed("catalog");
  assert.deepEqual(application.provider, expected);

  assert.deepEqual(reduceInput(application, "/models\r\r").effects, [
    { id: "ollamaCloud", kind: "loadModels" },
  ]);
  assert.ok(application.modelsLoaded("ollamaCloud", [
    { cost: "cloud", id: "qwen3-coder:480b-cloud", selected: true },
    { cost: "cloud", id: "glm-4.7:cloud", selected: false },
  ]).ok);
  assert.deepEqual(reduceInput(application, "\u001B[B\r").effects, [{
    kind: "selectProviderModel",
    modelId: "glm-4.7:cloud",
    providerId: "ollamaCloud",
  }]);
  application.providerOperationFailed("model");
  assert.deepEqual(application.provider, expected);
});

test("retired providers command is unknown and cannot capture composer input", () => {
  const application = new ApplicationController(true, unconfiguredProviders());

  const retired = reduceInput(application, "/providers\r");
  assert.deepEqual(retired.effects, []);
  assert.deepEqual(application.notice, ["Unknown command"]);
  assert.equal(application.draftLength, 0);
});

test("rejects invalid configured provider snapshots", () => {
  const provider = configuredProviders().at(0);
  assert.ok(provider !== undefined);
  for (const create of [
    () => new ApplicationController(true, [provider, provider]),
    () => new ApplicationController(true, [{ ...provider, configured: false }]),
  ]) {
    let caught: unknown;
    try {
      create();
    } catch (cause: unknown) {
      caught = cause;
    }
    assert.equal(caught instanceof ApplicationError, true);
    if (caught instanceof ApplicationError) {
      assert.equal(caught.kind, "providerInvariant");
    }
  }
});

test("replaces, dismisses, and expires only the current notice generation", () => {
  const application = new ApplicationController(false);

  reduceInput(application, "/unknown\r");
  const stale = application.noticeToken;
  assert.ok(stale !== undefined);
  assert.equal(application.noticeLevel, "warning");

  reduceInput(application, "/models\r");
  const current = application.noticeToken;
  assert.ok(current !== undefined);
  assert.equal(current === stale, false);
  assert.equal(application.noticeLevel, "warning");
  assert.equal(application.expireNotice(stale).redraw, false);
  assert.deepEqual(application.notice, [
    "No authenticated providers. Exit and run agent auth first.",
  ]);
  assert.equal(application.expireNotice(current).redraw, true);
  assert.deepEqual(application.notice, []);
  assert.equal(application.noticeToken, undefined);

  reduceInput(application, "/unknown\r");
  assert.ok(application.noticeToken !== undefined);
  application.feed("x");
  assert.deepEqual(application.notice, []);
  assert.equal(application.noticeToken, undefined);
});

test("routes clipboard settlement through one composer notice generation", () => {
  const application = new ApplicationController(false);

  assert.equal(application.clipboardSettled("copied").redraw, true);
  assert.deepEqual(application.notice, ["Copied!"]);
  assert.equal(application.noticeLevel, "info");
  assert.equal(application.noticePlacement, "composer");
  const copied = application.noticeToken;
  assert.ok(copied !== undefined);

  application.clipboardSettled("failed");
  assert.deepEqual(application.notice, ["Copy failed!"]);
  assert.equal(application.noticeLevel, "warning");
  assert.equal(application.noticePlacement, "composer");
  assert.equal(application.expireNotice(copied).redraw, false);

  const failed = application.noticeToken;
  assert.ok(failed !== undefined);
  assert.equal(application.expireNotice(failed).redraw, true);
  assert.deepEqual(application.notice, []);
  assert.equal(application.noticePlacement, "context");
});

test("active Ctrl+C requests one cancellation and preserves the draft", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(1, "question")).ok);
  application.feed("next draft");

  const first = reduceInput(application, "\u0003");
  const second = reduceInput(application, "\u0003");

  assert.deepEqual(first.effects, [{ kind: "cancelTurn", turnId: 1 }]);
  assert.deepEqual(second.effects, []);
  assert.equal(application.phase, "cancelling");
  assert.equal(application.project(40).text, "next draft");
  assert.deepEqual(application.notice, []);
});

test("keeps selector focus through ordinary input until explicit dismissal", () => {
  const application = new ApplicationController(false);
  application.feed("retained draft");
  application.applySessionAction({ kind: "openPermissions" });

  const ignored = application.feed("text\t\u007F");

  assert.equal(ignored.redraw, false);
  assert.deepEqual(ignored.effects, []);
  assert.ok(application.projectPermissionMenu() !== undefined);
  assert.equal(application.project(40).text, "retained draft");

  const dismissed = application.feed("\u001B", 0, undefined, true);

  assert.equal(dismissed.redraw, true);
  assert.deepEqual(dismissed.effects, []);
  assert.equal(application.projectPermissionMenu(), undefined);
  assert.equal(application.project(40).text, "retained draft");
});

test("preserves ordered coalesced shutdown actions without duplicate exit", () => {
  const command = new ApplicationController(true);
  assert.ok(command.turnAccepted(started(1, "question")).ok);
  command.feed("preserved draft");
  const commandExit = command.feed("\u0003/exit\r");
  assert.deepEqual(commandExit.effects, [
    { kind: "cancelTurn", turnId: 1 },
    { kind: "exit" },
  ]);
  assert.equal(command.project(40).text, "preserved draft");

  const idleExit = new ApplicationController(false).feed("\u0003/exit\r");
  assert.deepEqual(idleExit.effects, [{ kind: "exit" }]);

  const unknown = new ApplicationController(true);
  assert.ok(unknown.turnAccepted(started(2, "question")).ok);
  assert.deepEqual(unknown.feed("\u0003/not-exit\r").effects, [
    { kind: "cancelTurn", turnId: 2 },
  ]);

  const eof = new ApplicationController(true);
  assert.ok(eof.turnAccepted(started(3, "question")).ok);
  assert.deepEqual(eof.feed("\u0003\u0004").effects, [
    { kind: "cancelTurn", turnId: 3 },
    { kind: "exit" },
  ]);
});

test("owns bounded transcript navigation and resumes follow at the end", () => {
  const application = new ApplicationController(true);
  assert.ok(application.observeTranscriptGeometry(20, 5).ok);

  const pageUp = application.applySessionAction({
    kind: "navigateTranscript",
    movement: "pageUp",
  });
  assert.equal(pageUp.redraw, true);
  assert.equal(application.transcriptScroll.followingEnd, false);
  assert.equal(application.transcriptScroll.offset, 11);

  const lineUp = application.applySessionAction({
    kind: "navigateTranscript",
    movement: "lineUp",
  });
  assert.equal(lineUp.redraw, true);
  assert.equal(application.transcriptScroll.offset, 10);

  const pageDown = application.applySessionAction({
    kind: "navigateTranscript",
    movement: "pageDown",
  });
  assert.equal(pageDown.redraw, true);
  assert.equal(application.transcriptScroll.offset, 14);
  assert.equal(application.transcriptScroll.followingEnd, false);

  const end = application.applySessionAction({
    kind: "navigateTranscript",
    movement: "lineDown",
  });
  assert.equal(end.redraw, true);
  assert.equal(application.transcriptScroll.followingEnd, true);
  assert.equal(application.transcriptScroll.offset, 15);
});

test("keeps transcript navigation inert without overflow or visible geometry", () => {
  const hidden = new ApplicationController(true);
  assert.ok(hidden.observeTranscriptGeometry(20, 0).ok);
  assert.equal(
    hidden.applySessionAction({
      kind: "navigateTranscript",
      movement: "pageUp",
    }).redraw,
    false,
  );

  const fitting = new ApplicationController(true);
  assert.ok(fitting.observeTranscriptGeometry(3, 5).ok);
  assert.equal(
    fitting.applySessionAction({
      kind: "navigateTranscript",
      movement: "lineUp",
    }).redraw,
    false,
  );
  assert.equal(fitting.viewingHistory, false);

  const invalid = fitting.observeTranscriptGeometry(-1, 5);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "scrollInvariant");
});

test("preserves manual history across growth and follows a newly accepted turn", () => {
  const application = new ApplicationController(true);
  assert.ok(application.observeTranscriptGeometry(20, 5).ok);
  application.applySessionAction({
    kind: "navigateTranscript",
    movement: "pageUp",
  });
  assert.equal(application.transcriptScroll.offset, 11);

  assert.ok(application.observeTranscriptGeometry(25, 5).ok);
  assert.equal(application.transcriptScroll.offset, 11);
  assert.equal(application.viewingHistory, true);

  assert.ok(application.turnAccepted(started(41, "new question")).ok);
  assert.equal(application.transcriptScroll.followingEnd, true);
  assert.equal(application.transcriptScroll.offset, 0);
});

test("clamps manual history after content shrink and resumes follow on movement", () => {
  const application = new ApplicationController(true);
  assert.ok(application.observeTranscriptGeometry(20, 5).ok);
  application.applySessionAction({
    kind: "navigateTranscript",
    movement: "pageUp",
  });
  assert.equal(application.transcriptScroll.offset, 11);
  assert.equal(application.viewingHistory, true);

  assert.ok(application.observeTranscriptGeometry(8, 5).ok);
  assert.equal(application.transcriptScroll.offset, 3);
  assert.equal(application.viewingHistory, true);

  const newest = application.applySessionAction({
    kind: "navigateTranscript",
    movement: "lineDown",
  });
  assert.equal(newest.redraw, true);
  assert.equal(application.transcriptScroll.offset, 3);
  assert.equal(application.transcriptScroll.followingEnd, true);
});

test("idle Ctrl+C and every explicit exit path emit exit", () => {
  const interrupt = reduceInput(
    new ApplicationController(false),
    "\u0003",
  );
  const command = reduceInput(
    new ApplicationController(false),
    "/exit\r",
  );
  const eof = reduceInput(new ApplicationController(false), "\u0004");

  assert.deepEqual(interrupt.effects, [{ kind: "exit" }]);
  assert.deepEqual(command.effects, [{ kind: "exit" }]);
  assert.deepEqual(eof.effects, [{ kind: "exit" }]);
});

test("publishes exact streamed completion and returns to idle", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(3, "question"));
  assert.deepEqual(application.notice, []);
  const delta = application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "answer",
      turnId: 3,
    }),
  );
  const finish = application.applyRuntime(completed(3, "answer"));

  assert.ok(delta.ok);
  assert.ok(finish.ok);
  if (finish.ok) {
    assert.deepEqual(finish.value.effects, [{ kind: "commitTurn", turnId: 3 }]);
  }
  const committed = application.turnCommitResolved(
    3,
    Object.freeze({ historyNodeId: 1, kind: "committed" as const }),
  );
  assert.ok(committed.ok);
  assert.equal(application.phase, "idle");
  assert.equal(application.transcriptText(), "question\n\nanswer");
  assert.deepEqual(application.notice, []);
});

test("stages two-axis thinking settings and captures effort per turn", () => {
  const application = new ApplicationController(true, configuredProviders());

  reduceInput(application, "/thinking\r");
  assert.deepEqual(application.projectThinkingMenu(), {
    display: "off",
    effort: "off",
    selectedIndex: 0,
  });
  reduceInput(application, "\u001B[C\u001B[B\u001B[C\u001B[C");
  assert.deepEqual(application.projectThinkingMenu(), {
    display: "on",
    effort: "medium",
    selectedIndex: 1,
  });
  assert.equal(application.thinkingDisplay, "off");
  assert.equal(application.thinkingEffort, "off");
  reduceInput(application, "\r");
  assert.equal(application.thinkingDisplay, "on");
  assert.equal(application.thinkingEffort, "medium");
  assert.equal(application.projectThinkingMenu(), undefined);

  const submitted = reduceInput(application, "question\r");
  assert.deepEqual(submitted.effects, [
    { effort: "medium", kind: "startTurn", text: "question" },
  ]);
  assert.ok(application.turnAccepted(started(30, "question")).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "reasoningDelta" as const,
    text: "considering",
    turnId: 30,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: "answer",
    turnId: 30,
  })).ok);
  const prepared = application.applyRuntime(Object.freeze({
    assistant: Object.freeze({ content: "answer", reasoning: "considering" }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId: 30,
  }) as unknown as RuntimeEvent<string>);

  assert.ok(prepared.ok);
  assert.deepEqual(
    application.transcriptEntries().map((entry) => [entry.role, entry.content]),
    [
      ["user", "question"],
      ["reasoning", "considering"],
      ["assistant", "answer"],
    ],
  );
});

test("requires a configured provider and selected model before opening thinking", () => {
  for (const application of [
    new ApplicationController(true),
    new ApplicationController(true, unconfiguredProviders()),
  ]) {
    const opened = reduceInput(application, "/thinking\r");
    assert.deepEqual(opened.effects, []);
    assert.equal(application.projectThinkingMenu(), undefined);
    assert.deepEqual(application.notice, [
      "Provider authentication is unavailable. Exit and run agent auth.",
    ]);
  }

  const withoutModel = new ApplicationController(
    true,
    configuredProviderWithoutModel(),
  );
  const opened = reduceInput(withoutModel, "/thinking\r");
  assert.deepEqual(opened.effects, []);
  assert.equal(withoutModel.projectThinkingMenu(), undefined);
  assert.deepEqual(withoutModel.notice, ["Select a model with /models first."]);
});

test("preserves both thinking settings through an accepted model selection", () => {
  const application = new ApplicationController(true, configuredProviders());
  reduceInput(application, "/thinking\r\u001B[C\u001B[B\u001B[C\u001B[C\r");
  assert.equal(application.thinkingDisplay, "on");
  assert.equal(application.thinkingEffort, "medium");

  assert.deepEqual(reduceInput(application, "/models\r\r").effects, [
    { id: "ollamaCloud", kind: "loadModels" },
  ]);
  assert.ok(application.modelsLoaded("ollamaCloud", [
    { cost: "cloud", id: "qwen3-coder:480b-cloud", selected: true },
    { cost: "cloud", id: "glm-4.7:cloud", selected: false },
  ]).ok);
  assert.deepEqual(reduceInput(application, "\u001B[B\r").effects, [
    {
      kind: "selectProviderModel",
      modelId: "glm-4.7:cloud",
      providerId: "ollamaCloud",
    },
  ]);
  const selected = configuredProviders().map((provider) => Object.freeze({
    ...provider,
    presentation: Object.freeze({
      ...provider.presentation,
      model: "glm-4.7:cloud",
    }),
  }));
  assert.ok(
    application.providerModelSelected(
      selected,
      "ollamaCloud",
      "glm-4.7:cloud",
    ).ok,
  );
  assert.equal(application.thinkingDisplay, "on");
  assert.equal(application.thinkingEffort, "medium");

  assert.deepEqual(reduceInput(application, "question\r").effects, [
    { effort: "medium", kind: "startTurn", text: "question" },
  ]);
  assert.ok(application.turnAccepted(started(32, "question")).ok);
  const failed = application.applyRuntime(Object.freeze({
    checkpointed: false,
    cleanup: Object.freeze([]),
    historyNodeId: undefined,
    kind: "turnFinished" as const,
    outcome: Object.freeze({
      failure: Object.freeze({
        error: "unsupported effort",
        kind: "model" as const,
        operation: "open" as const,
      }),
      kind: "failed" as const,
    }),
    turnId: 32,
  }));
  assert.ok(failed.ok);
  assert.equal(application.thinkingDisplay, "on");
  assert.equal(application.thinkingEffort, "medium");
  assert.equal(application.notice.at(0)?.includes("model/open"), true);
});

test("keeps thinking row values inside their closed non-wrapping bounds", () => {
  const application = new ApplicationController(true, configuredProviders());
  reduceInput(application, "/thinking\r");

  assert.equal(reduceInput(application, "\u001B[D").redraw, false);
  reduceInput(application, "\u001B[B");
  assert.equal(reduceInput(application, "\u001B[D").redraw, false);
  reduceInput(application, "\u001B[C\u001B[C\u001B[C");
  assert.deepEqual(application.projectThinkingMenu(), {
    display: "off",
    effort: "high",
    selectedIndex: 1,
  });
  assert.equal(reduceInput(application, "\u001B[C").redraw, false);
});

test("hides retained reasoning without deleting it and discards staged changes", () => {
  const application = new ApplicationController(true, configuredProviders());

  reduceInput(application, "/thinking\r\u001B[B\u001B[C\r");
  assert.equal(application.thinkingDisplay, "off");
  assert.equal(application.thinkingEffort, "low");
  assert.deepEqual(reduceInput(application, "question\r").effects, [
    { effort: "low", kind: "startTurn", text: "question" },
  ]);
  assert.ok(application.turnAccepted(started(31, "question")).ok);
  const hiddenDelta = application.applyRuntime(Object.freeze({
    kind: "reasoningDelta" as const,
    text: "retained reasoning",
    turnId: 31,
  }));
  assert.ok(hiddenDelta.ok);
  if (hiddenDelta.ok) assert.equal(hiddenDelta.value.redraw, false);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: "answer",
    turnId: 31,
  })).ok);
  const prepared = application.applyRuntime(Object.freeze({
    assistant: Object.freeze({ content: "answer", reasoning: "retained reasoning" }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId: 31,
  }) as unknown as RuntimeEvent<string>);
  assert.ok(prepared.ok);
  assert.ok(application.turnCommitResolved(31, Object.freeze({
    historyNodeId: 1,
    kind: "committed" as const,
  })).ok);
  assert.deepEqual(
    application.transcriptEntries().map((entry) => [entry.role, entry.content]),
    [["user", "question"], ["assistant", "answer"]],
  );

  reduceInput(application, "/thinking\r\u001B[C");
  assert.equal(application.thinkingDisplay, "off");
  reduceInput(application, "\r");
  assert.equal(application.thinkingDisplay, "on");
  assert.deepEqual(
    application.transcriptEntries().map((entry) => [entry.role, entry.content]),
    [
      ["user", "question"],
      ["reasoning", "retained reasoning"],
      ["assistant", "answer"],
    ],
  );

  reduceInput(application, "/thinking\r\u001B[D\u001B[B\u001B[C\u0003");
  assert.equal(application.thinkingDisplay, "on");
  assert.equal(application.thinkingEffort, "low");
});

test("hides restored reasoning by default and reveals it from the session setting", () => {
  const application = new ApplicationController(
    true,
    configuredProviders(),
    undefined,
    Object.freeze({
      activeNodeId: 1,
      turns: Object.freeze([
        Object.freeze({
          assistant: "restored answer",
          historyNodeId: 1,
          historyParentNodeId: 0,
          reasoning: "restored reasoning",
          settlement: "completed" as const,
          user: "restored question",
        }),
      ]),
    }),
  );

  assert.equal(application.transcriptText(), "restored question\n\nrestored answer");
  reduceInput(application, "/thinking\r\u001B[C\r");
  assert.equal(
    application.transcriptText(),
    "restored question\n\nrestored reasoning\n\nrestored answer",
  );
});

test("selects a timeline node only after the runtime-authoritative effect", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(1, "root question"));
  application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: "root answer",
    turnId: 1,
  }));
  application.applyRuntime(completed(1, "root answer"));
  assert.ok(application.turnCommitResolved(1, Object.freeze({
    historyNodeId: 1,
    kind: "committed" as const,
  })).ok);
  application.turnAccepted(started(2, "original question", 1));
  application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: "original answer",
    turnId: 2,
  }));
  application.applyRuntime(completed(2, "original answer"));
  assert.ok(application.turnCommitResolved(2, Object.freeze({
    historyNodeId: 2,
    kind: "committed" as const,
  })).ok);

  assert.deepEqual(reduceInput(application, "/timeline\r").effects, []);
  assert.equal(application.projectTimelineMenu()?.selectedIndex, 2);
  const requested = reduceInput(application, "\u001B[A\r");
  assert.deepEqual(requested.effects, [
    { kind: "selectTimelineNode", nodeId: 1 },
  ]);
  assert.equal(application.transcriptText().includes("original question"), true);

  const selected = application.conversationNodeSelected(1);
  assert.ok(selected.ok);
  assert.equal(application.transcriptText(), "root question\n\nroot answer");
  assert.deepEqual(application.notice, ["Timeline node #1 selected."]);
});

test("filters stale events and discards failed prospective content", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(4, "private question"));
  const stale = application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "stale private response",
      turnId: 99,
    }),
  );
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "partial private response",
      turnId: 4,
    }),
  );
  const failed = application.applyRuntime(
    Object.freeze({
      checkpointed: false,
      cleanup: Object.freeze([
        Object.freeze({ kind: "model" as const, error: "private cleanup" }),
      ]),
      historyNodeId: undefined,
      kind: "turnFinished" as const,
      outcome: Object.freeze({
        failure: Object.freeze({
          error: "private model error",
          kind: "model" as const,
          operation: "read" as const,
        }),
        kind: "failed" as const,
      }),
      turnId: 4,
    }),
  );

  assert.ok(stale.ok);
  assert.equal(stale.value.redraw, false);
  assert.ok(failed.ok);
  assert.equal(application.hasTranscript, false);
  assert.equal(application.transcriptText(), "");
  assert.equal(application.notice.join("\n").includes("private"), false);
  assert.equal(application.notice.at(0)?.includes("model/read"), true);
});

test("identifies invalid model tool calls without retaining their content", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(5, "private tool request"));

  const failed = application.applyRuntime(
    Object.freeze({
      checkpointed: false,
      cleanup: Object.freeze([]),
      historyNodeId: undefined,
      kind: "turnFinished" as const,
      outcome: Object.freeze({
        failure: Object.freeze({
          kind: "invalidToolCall" as const,
          reason: "invalidInput" as const,
        }),
        kind: "failed" as const,
      }),
      turnId: 5,
    }),
  );

  assert.ok(failed.ok);
  assert.equal(
    application.notice.at(0)?.includes("tool/invalid-call/input"),
    true,
  );
  assert.equal(application.notice.join("\n").includes("private"), false);
});

test("discards a second submission while a turn is active", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(1, "first question"));
  const secondText = "second private question";

  const update = reduceInput(application, secondText + "\r");

  assert.deepEqual(update.effects, []);
  assert.equal(application.notice.join("\n").includes(secondText), false);
  assert.equal(application.transcriptText().includes(secondText), false);
});

test("explicitly releases draft, status, and display-only personal content", () => {
  const application = new ApplicationController(true, configuredProviders());
  reduceInput(application, "/thinking\r\u001B[C\u001B[B\u001B[C\r");
  application.turnAccepted(started(1, "private question"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "private answer",
      turnId: 1,
    }),
  );
  application.feed("private draft");

  application.clear();

  assert.equal(application.activeTurnId, undefined);
  assert.equal(application.draftLength, 0);
  assert.equal(application.hasTranscript, false);
  assert.equal(application.transcriptText(), "");
  assert.deepEqual(application.activities, []);
  assert.deepEqual(application.notice, []);
  assert.equal(application.thinkingDisplay, "off");
  assert.equal(application.thinkingEffort, "off");
});

test("requires one contextual permission decision and exposes one bounded activity snapshot", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(7, "change it")).ok);
  const requested = application.applyRuntime(
    Object.freeze({
      approvalRequired: true,
      approvalPreview: 'path="src/index.ts" oldText=<3 code units>',
      callId: "private-call-id",
      kind: "toolRequested" as const,
      name: "apply_patch",
      risk: "write" as const,
      turnId: 7,
    }),
  );
  assert.ok(requested.ok);
  assert.equal(application.phase, "awaitingPermission");
  assert.deepEqual(application.activities, [
    {
      name: "apply_patch",
      preview: 'path="src/index.ts" oldText=<3 code units>',
      risk: "write",
      state: "permission",
    },
  ]);
  assert.equal(
    JSON.stringify(application.activities).includes("private-call-id"),
    false,
  );

  const approved = reduceInput(application, "\r");
  assert.deepEqual(approved.effects, [
    {
      allowed: true,
      callId: "private-call-id",
      kind: "resolveToolPermission",
      operatorApproved: true,
      turnId: 7,
    },
  ]);
  assert.equal(application.activities.at(0)?.state, "queued");
  const repeated = reduceInput(application, "/approve\r");
  assert.deepEqual(repeated.effects, []);
  assert.deepEqual(application.notice, ["Unknown command"]);
});

test("replaces contextual activity for each call in one tool batch", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(70, "inspect both")).ok);

  for (const event of [
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-70-a",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 70,
    }),
    Object.freeze({
      callId: "call-70-a",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 70,
    }),
    Object.freeze({
      callId: "call-70-a",
      kind: "toolFinished" as const,
      name: "read_file",
      risk: "read" as const,
      status: "success" as const,
      turnId: 70,
    }),
  ]) {
    assert.ok(application.applyRuntime(event).ok);
  }
  assert.deepEqual(application.activities, [
    { name: "read_file", preview: "", risk: "read", state: "succeeded" },
  ]);

  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: "",
        approvalRequired: false,
        callId: "call-70-b",
        kind: "toolRequested" as const,
        name: "list_directory",
        risk: "read" as const,
        turnId: 70,
      }),
    ).ok,
  );
  assert.deepEqual(application.activities, [
    {
      name: "list_directory",
      preview: "",
      risk: "read",
      state: "queued",
    },
  ]);
  assert.equal(application.transcriptText().includes("read_file"), false);
  assert.equal(application.transcriptText().includes("list_directory"), false);
});

test("retains a complete read cohort through ordered permission, start, and finish events", () => {
  const application = new ApplicationController(true);
  reduceInput(application, "/permissions\r");
  reduceInput(application, "\u001B[D");
  reduceInput(application, "\r");
  assert.ok(application.turnAccepted(started(71, "inspect together")).ok);

  const firstRequested = application.applyRuntime(
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-71-a",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 71,
    }),
  );
  assert.ok(firstRequested.ok);
  assert.deepEqual(firstRequested.value.effects, []);
  assert.equal(application.activities.at(0)?.state, "permission");
  assert.deepEqual(reduceInput(application, "\r").effects, [
    {
      allowed: true,
      callId: "call-71-a",
      kind: "resolveToolPermission",
      operatorApproved: true,
      turnId: 71,
    },
  ]);

  const secondRequested = application.applyRuntime(
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-71-b",
      kind: "toolRequested" as const,
      name: "list_directory",
      risk: "read" as const,
      turnId: 71,
    }),
  );
  assert.ok(secondRequested.ok);
  assert.equal(
    secondRequested.value.effects.at(0)?.kind,
    "resolveToolPermission",
  );
  assert.deepEqual(application.activities, [
    { name: "read_file", preview: "", risk: "read", state: "queued" },
    { name: "list_directory", preview: "", risk: "read", state: "queued" },
  ]);

  assert.equal(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="blocked.txt"',
        approvalRequired: true,
        callId: "call-71-write",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 71,
      }),
    ).ok,
    false,
  );

  for (const event of [
    Object.freeze({
      callId: "call-71-a",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 71,
    }),
    Object.freeze({
      callId: "call-71-b",
      kind: "toolStarted" as const,
      name: "list_directory",
      risk: "read" as const,
      turnId: 71,
    }),
  ]) {
    assert.ok(application.applyRuntime(event).ok);
  }
  assert.deepEqual(
    application.activities.map((entry) => entry.state),
    ["running", "running"],
  );

  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-71-a",
        kind: "toolFinished" as const,
        name: "read_file",
        risk: "read" as const,
        status: "success" as const,
        turnId: 71,
      }),
    ).ok,
  );
  assert.equal(application.phase, "runningTool");
  assert.deepEqual(
    application.activities.map((entry) => entry.state),
    ["succeeded", "running"],
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-71-b",
        kind: "toolFinished" as const,
        name: "list_directory",
        risk: "read" as const,
        status: "success" as const,
        turnId: 71,
      }),
    ).ok,
  );
  assert.equal(application.phase, "generating");
  assert.deepEqual(
    application.activities.map((entry) => entry.state),
    ["succeeded", "succeeded"],
  );
});

test("classifies model continuation failure after checkpointed tool success", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(8, "inspect")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        kind: "assistantDelta" as const,
        text: "Checking.",
        turnId: 8,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalRequired: false,
        approvalPreview: "",
        callId: "call-8",
        kind: "toolRequested" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 8,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-8",
        kind: "toolStarted" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 8,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-8",
        kind: "toolFinished" as const,
        name: "read_file",
        risk: "read" as const,
        status: "success" as const,
        turnId: 8,
      }),
    ).ok,
  );
  const failed = application.applyRuntime(
    Object.freeze({
      checkpointed: true,
      cleanup: Object.freeze([]),
      historyNodeId: 1,
      kind: "turnFinished" as const,
      outcome: Object.freeze({
        failure: Object.freeze({
          error: "private provider failure",
          kind: "model" as const,
          operation: "read" as const,
        }),
        kind: "failed" as const,
      }),
      turnId: 8,
    }),
  );
  assert.ok(failed.ok);
  assert.equal(application.phase, "idle");
  assert.deepEqual(application.activities, []);
  assert.equal(application.transcriptText().includes("Checking."), true);
  assert.equal(
    application.transcriptText().includes(
      "[turn failed (model/read) after completed tool activity]",
    ),
    true,
  );
  assert.equal(
    application.notice.join("\n").includes("model/read"),
    true,
  );
  assert.equal(
    application.notice.join("\n").includes("private provider failure"),
    false,
  );
  assert.equal(
    application.notice.join("\n").includes("remains in conversation"),
    true,
  );

  assert.ok(application.turnAccepted(started(9, "next", 1)).ok);
  assert.deepEqual(application.activities, []);
});

test("makes tool cancellation visible through authoritative lifecycle states", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(30, "inspect")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: "",
        approvalRequired: false,
        callId: "call-30",
        kind: "toolRequested" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 30,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-30",
        kind: "toolStarted" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 30,
      }),
    ).ok,
  );

  const cancelling = reduceInput(application, "\u0003");
  assert.deepEqual(cancelling.effects, [{ kind: "cancelTurn", turnId: 30 }]);
  assert.equal(application.activities.at(0)?.state, "cancelling");

  const cancelled = application.applyRuntime(
    Object.freeze({
      checkpointed: false,
      cleanup: Object.freeze([]),
      historyNodeId: undefined,
      kind: "turnFinished" as const,
      outcome: Object.freeze({ kind: "cancelled" as const }),
      turnId: 30,
    }),
  );
  assert.ok(cancelled.ok);
  assert.deepEqual(application.activities, []);
});

test("removes legacy approval commands and opens the session permission editor", () => {
  const application = new ApplicationController(true);
  const denied = reduceInput(application, "/deny\r");

  assert.deepEqual(denied.effects, []);
  assert.deepEqual(application.notice, ["Unknown command"]);
  reduceInput(application, "/permissions\r");
  assert.equal(application.projectPermissionMenu()?.items.length, 6);
});

test("edits read permissions in session and asks without an effect preview", () => {
  const application = new ApplicationController(true);
  reduceInput(application, "/permissions\r");
  assert.deepEqual(application.projectPermissionMenu()?.items.at(0), {
    mode: "allow",
    name: "read_file",
    risk: "read",
  });

  reduceInput(application, "\u001B[D");
  assert.equal(application.projectPermissionMenu()?.items.at(0)?.mode, "ask");
  reduceInput(application, "\r");
  assert.equal(application.projectPermissionMenu(), undefined);

  assert.ok(application.turnAccepted(started(41, "inspect")).ok);
  const requested = application.applyRuntime(
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "read-ask",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 41,
    }),
  );
  assert.ok(requested.ok);
  assert.deepEqual(requested.value.effects, []);
  assert.equal(application.phase, "awaitingPermission");
  assert.equal(application.activities.at(0)?.state, "permission");
  assert.deepEqual(application.projectToolDecision(), {
    actions: ["allowOnce", "allowSession", "deny"],
    selectedIndex: 0,
  });
});

test("denies a configured read automatically and never marks it started", () => {
  const application = new ApplicationController(true);
  reduceInput(application, "/permissions\r\u001B[D\u001B[D\r");
  assert.ok(application.turnAccepted(started(42, "inspect")).ok);

  const requested = application.applyRuntime(
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "read-denied",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 42,
    }),
  );
  assert.ok(requested.ok);
  assert.deepEqual(requested.value.effects, [
    {
      allowed: false,
      callId: "read-denied",
      kind: "resolveToolPermission",
      operatorApproved: false,
      turnId: 42,
    },
  ]);
  assert.equal(application.activities.at(0)?.state, "denied");
  assert.equal(
    application.applyRuntime(
      Object.freeze({
        callId: "read-denied",
        kind: "toolStarted" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 42,
      }),
    ).ok,
    false,
  );
});

test("allows one exact tool for the session without authorizing other tools", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(43, "change twice")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="one.txt"',
        approvalRequired: true,
        callId: "write-one",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 43,
      }),
    ).ok,
  );

  const allowed = reduceInput(application, "\u001B[B\r");
  assert.deepEqual(allowed.effects, [
    {
      allowed: true,
      callId: "write-one",
      kind: "resolveToolPermission",
      operatorApproved: true,
      turnId: 43,
    },
  ]);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "write-one",
        kind: "toolStarted" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 43,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "write-one",
        kind: "toolFinished" as const,
        name: "apply_patch",
        risk: "write" as const,
        status: "success" as const,
        turnId: 43,
      }),
    ).ok,
  );

  const repeated = application.applyRuntime(
    Object.freeze({
      approvalPreview: 'path="two.txt"',
      approvalRequired: true,
      callId: "write-two",
      kind: "toolRequested" as const,
      name: "apply_patch",
      risk: "write" as const,
      turnId: 43,
    }),
  );
  assert.ok(repeated.ok);
  assert.equal(application.phase, "runningTool");
  assert.deepEqual(repeated.value.effects, [
    {
      allowed: true,
      callId: "write-two",
      kind: "resolveToolPermission",
      operatorApproved: false,
      turnId: 43,
    },
  ]);

  application.applySessionAction({ kind: "openPermissions" });
  assert.equal(application.projectPermissionMenu()?.items.at(3)?.mode, "allow");
  assert.equal(application.projectPermissionMenu()?.items.at(4)?.mode, "ask");
});

test("blocks legacy decision text and resets grants during cleanup", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(44, "change")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="one.txt"',
        approvalRequired: true,
        callId: "write-blocked",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 44,
      }),
    ).ok,
  );
  const legacy = reduceInput(application, "/approve\r");
  assert.deepEqual(legacy.effects, []);
  assert.equal(application.phase, "awaitingPermission");
  assert.equal(application.activities.at(0)?.state, "permission");

  application.clear();
  reduceInput(application, "/permissions\r");
  assert.equal(application.projectPermissionMenu()?.items.at(0)?.mode, "allow");
  assert.equal(application.projectPermissionMenu()?.items.at(3)?.mode, "ask");
});

test("accepts a failed mutation plan without exposing an approval", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(12, "change")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: "",
        approvalRequired: false,
        callId: "call-stale",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.equal(application.activities.at(0)?.state, "queued");
  assert.deepEqual(reduceInput(application, "/approve\r").effects, []);
  assert.deepEqual(application.notice, ["Unknown command"]);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-stale",
        kind: "toolStarted" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 12,
      }),
    ).ok,
  );
});

test("rejects tool events that bypass approval or contradict checkpoints", () => {
  const deceptivePreview = new ApplicationController(true);
  assert.ok(deceptivePreview.turnAccepted(started(9, "change")).ok);
  assert.equal(
    deceptivePreview.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="docs/\u202Egnp.exe"',
        approvalRequired: true,
        callId: "call-9",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 9,
      }),
    ).ok,
    false,
  );

  const beforeApproval = new ApplicationController(true);
  assert.ok(beforeApproval.turnAccepted(started(10, "change")).ok);
  assert.ok(
    beforeApproval.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="file.txt" content=<3 code units>',
        approvalRequired: true,
        callId: "call-10",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 10,
      }),
    ).ok,
  );
  assert.equal(
    beforeApproval.applyRuntime(
      Object.freeze({
        callId: "call-10",
        kind: "toolStarted" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 10,
      }),
    ).ok,
    false,
  );
  assert.equal(
    beforeApproval.applyRuntime(
      Object.freeze({
        callId: "call-10",
        kind: "toolFinished" as const,
        name: "apply_patch",
        risk: "write" as const,
        status: "success" as const,
        turnId: 10,
      }),
    ).ok,
    false,
  );
  assert.equal(
    beforeApproval.applyRuntime(
      Object.freeze({
        assistant: Object.freeze({ content: "done" }),
        checkpointed: false,
        cleanup: Object.freeze([]),
        historyNodeId: undefined,
        kind: "turnPrepared" as const,
        turnId: 10,
      }) as never,
    ).ok,
    false,
  );

  const afterDenial = new ApplicationController(true);
  assert.ok(afterDenial.turnAccepted(started(11, "change")).ok);
  assert.ok(
    afterDenial.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="file.txt" content=<3 code units>',
        approvalRequired: true,
        callId: "call-11",
        kind: "toolRequested" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 11,
      }),
    ).ok,
  );
  reduceInput(afterDenial, "\u001B[B\u001B[B\r");
  assert.equal(
    afterDenial.applyRuntime(
      Object.freeze({
        callId: "call-11",
        kind: "toolStarted" as const,
        name: "apply_patch",
        risk: "write" as const,
        turnId: 11,
      }),
    ).ok,
    false,
  );
  const deniedFinish = afterDenial.applyRuntime(
    Object.freeze({
      callId: "call-11",
      kind: "toolFinished" as const,
      name: "apply_patch",
      risk: "write" as const,
      status: "failure" as const,
      turnId: 11,
    }),
  );
  assert.ok(deniedFinish.ok);
  assert.equal(afterDenial.activities.at(0)?.state, "denied");

  const mismatch = new ApplicationController(true);
  assert.ok(mismatch.turnAccepted(started(12, "inspect")).ok);
  assert.ok(
    mismatch.applyRuntime(
      Object.freeze({
        approvalPreview: "",
        approvalRequired: false,
        callId: "call-12",
        kind: "toolRequested" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.ok(
    mismatch.applyRuntime(
      Object.freeze({
        callId: "call-12",
        kind: "toolStarted" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.ok(
    mismatch.applyRuntime(
      Object.freeze({
        callId: "call-12",
        kind: "toolFinished" as const,
        name: "read_file",
        risk: "read" as const,
        status: "success" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.equal(
    mismatch.applyRuntime(
      Object.freeze({
        checkpointed: false,
        cleanup: Object.freeze([]),
        historyNodeId: undefined,
        kind: "turnFinished" as const,
        outcome: Object.freeze({ kind: "cancelled" as const }),
        turnId: 12,
      }),
    ).ok,
    false,
  );
});

test("retains only checkpoint-backed text after cancellation", () => {
  const beforePreparation = new ApplicationController(true);
  assert.ok(beforePreparation.turnAccepted(started(20, "inspect")).ok);
  assert.ok(
    beforePreparation.applyRuntime(
      Object.freeze({ kind: "assistantDelta" as const, text: "backed", turnId: 20 }),
    ).ok,
  );
  for (const event of [
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-20",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 20,
    }),
    Object.freeze({
      callId: "call-20",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 20,
    }),
    Object.freeze({
      callId: "call-20",
      kind: "toolFinished" as const,
      name: "read_file",
      risk: "read" as const,
      status: "success" as const,
      turnId: 20,
    }),
  ]) {
    assert.ok(beforePreparation.applyRuntime(event).ok);
  }
  assert.ok(
    beforePreparation.applyRuntime(
      Object.freeze({ kind: "assistantDelta" as const, text: "prospective", turnId: 20 }),
    ).ok,
  );
  assert.ok(
    beforePreparation.applyRuntime(
      Object.freeze({
        checkpointed: true,
        cleanup: Object.freeze([]),
        historyNodeId: 1,
        kind: "turnFinished" as const,
        outcome: Object.freeze({ kind: "cancelled" as const }),
        turnId: 20,
      }),
    ).ok,
  );
  assert.equal(beforePreparation.transcriptText().includes("backed"), true);
  assert.equal(beforePreparation.transcriptText().includes("prospective"), false);

  const afterPreparation = new ApplicationController(true);
  assert.ok(afterPreparation.turnAccepted(started(21, "inspect")).ok);
  assert.ok(
    afterPreparation.applyRuntime(
      Object.freeze({ kind: "assistantDelta" as const, text: "backed", turnId: 21 }),
    ).ok,
  );
  for (const event of [
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-21",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 21,
    }),
    Object.freeze({
      callId: "call-21",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 21,
    }),
    Object.freeze({
      callId: "call-21",
      kind: "toolFinished" as const,
      name: "read_file",
      risk: "read" as const,
      status: "success" as const,
      turnId: 21,
    }),
    Object.freeze({ kind: "assistantDelta" as const, text: "prospective", turnId: 21 }),
  ]) {
    assert.ok(afterPreparation.applyRuntime(event).ok);
  }
  assert.ok(
    afterPreparation.applyRuntime(
      Object.freeze({
        assistant: Object.freeze({ content: "prospective" }),
        checkpointed: true,
        cleanup: Object.freeze([]),
        kind: "turnPrepared" as const,
        turnId: 21,
      }) as never,
    ).ok,
  );
  assert.ok(
    afterPreparation.turnCommitResolved(
      21,
      Object.freeze({ historyNodeId: 1, kind: "cancelled" as const }),
    ).ok,
  );
  assert.equal(afterPreparation.transcriptText().includes("backed"), true);
  assert.equal(afterPreparation.transcriptText().includes("prospective"), false);
});
