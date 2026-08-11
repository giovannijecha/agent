import {
  type Component,
  ComponentError,
  type Frame,
  InputArea,
  ok,
  Panel,
  type Result,
  ScrollView,
  TextBlock,
  ThreeColumnLine,
  TUI_LIMITS,
  type Tone,
  type VerticalAllocation,
  VerticalLayout,
  type VerticalSlot,
  type Viewport,
} from "@agent/tui";

import {
  createActivityDocument,
  projectCurrentActivity,
} from "./activity-view.js";
import type { ApplicationController } from "./application.js";
import { createCommandCompletionDocument } from "./command-completion-view.js";
import { createConversationDocument } from "./conversation-view.js";
import {
  constrain,
  createSpacer,
  createSpan,
  insetEdges,
} from "./view-components.js";

const DOCUMENT_SLOT = 0;
const ACTIVITY_LEAD_RHYTHM_ROWS = 1;
const ACTIVITY_LEAD_RHYTHM_PRIORITY = 4;
const COMPOSER_MAXIMUM_CONTENT_ROWS = 6;

export type ChatRender = Readonly<{
  frame: Frame;
  transcript: VerticalAllocation;
}>;

function phaseLabel(application: ApplicationController): string {
  return application.phase === "generating"
    ? "generating"
    : application.phase === "awaitingApproval"
      ? "approval"
      : application.phase === "runningTool"
        ? "working"
        : application.phase === "cancelling"
          ? "cancelling"
          : "ready";
}

function phaseTone(application: ApplicationController): Tone {
  return application.phase === "idle" ? "success" : "attention";
}

function createFooter(
  application: ApplicationController,
): Result<ThreeColumnLine, ComponentError> {
  const left = [];
  if (application.workspace !== undefined) {
    const workspace = createSpan(application.workspace, "plain");
    if (!workspace.ok) return workspace;
    left.push(workspace.value);
  }
  const center = [];
  const provider = application.provider;
  if (provider !== undefined) {
    const name = createSpan(provider.displayName, "plain");
    const model = createSpan(" \u00b7 " + provider.model, "muted");
    if (!name.ok) return name;
    if (!model.ok) return model;
    center.push(name.value, model.value);
  }
  const phase = createSpan(phaseLabel(application), phaseTone(application));
  if (!phase.ok) return phase;
  const right = [phase.value];
  if (application.viewingHistory) {
    const history = createSpan("\u2191 history  ", "muted");
    if (!history.ok) return history;
    right.unshift(history.value);
  }
  return ThreeColumnLine.create(left, center, right, { gap: 2 });
}

function createDocument(
  application: ApplicationController,
): Result<Component, ComponentError> {
  return createConversationDocument(application.transcriptEntries());
}

function createComposer(
  application: ApplicationController,
): Result<Panel, ComponentError> {
  const input = InputArea.create(application, {
    maximumRows: COMPOSER_MAXIMUM_CONTENT_ROWS,
    textTone: "plain",
  });
  if (!input.ok) return input;
  return Panel.create(input.value, {
    borderTone: "muted",
    horizontalPadding: 1,
  });
}

function createBottomChrome(
  application: ApplicationController,
): Result<Component, ComponentError> {
  const footer = createFooter(application);
  if (!footer.ok) return footer;
  return insetEdges(footer.value);
}

/** Maps CLI state onto one planned generic conversation shell and safe frame. */
export function createChatRender(
  application: ApplicationController,
  viewport: Viewport,
): Result<ChatRender, ComponentError> {
  const focusedActivity = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  const document = createDocument(application);
  if (!document.ok) return document;
  const documentView = ScrollView.create(
    document.value,
    application.transcriptScroll,
  );
  if (!documentView.ok) return documentView;
  const documentColumn = constrain(documentView.value);
  if (!documentColumn.ok) return documentColumn;

  const notice = TextBlock.create(
    application.notice.join("\n"),
    "tail",
    application.phase === "awaitingApproval" ? "attention" : "muted",
  );
  if (!notice.ok) return notice;
  const noticeColumn = constrain(notice.value);
  if (!noticeColumn.ok) return noticeColumn;

  const activity = createActivityDocument(focusedActivity);
  if (!activity.ok) return activity;
  const activityColumn = constrain(activity.value);
  if (!activityColumn.ok) return activityColumn;
  let activityRows = 0;
  if (focusedActivity !== undefined) {
    const activityHeight = activityColumn.value.measure(viewport.columns);
    if (!activityHeight.ok) return activityHeight;
    activityRows = activityHeight.value.preferredRows;
  }
  const activityLeadRhythm = createSpacer(ACTIVITY_LEAD_RHYTHM_ROWS);
  if (!activityLeadRhythm.ok) return activityLeadRhythm;

  const commandCompletion = application.projectCommandCompletion();
  const completion = createCommandCompletionDocument(commandCompletion);
  if (!completion.ok) return completion;
  const completionColumn = constrain(completion.value);
  if (!completionColumn.ok) return completionColumn;

  const composer = createComposer(application);
  if (!composer.ok) return composer;
  const composerColumn = constrain(composer.value);
  if (!composerColumn.ok) return composerColumn;
  const composerHeight = composerColumn.value.measure(viewport.columns);
  if (!composerHeight.ok) return composerHeight;

  const bottomChrome = createBottomChrome(application);
  if (!bottomChrome.ok) return bottomChrome;

  const slots: readonly VerticalSlot[] = Object.freeze([
    Object.freeze({
      component: documentColumn.value,
      flex: 1,
      minimumRows: 2,
      preferredRows: TUI_LIMITS.frameRows,
      priority: 3,
    }),
    Object.freeze({
      component: noticeColumn.value,
      flex: 0,
      minimumRows: application.notice.length > 0 ? 1 : 0,
      preferredRows: application.notice.length > 0 ? 2 : 0,
      priority: 4,
    }),
    Object.freeze({
      component: activityLeadRhythm.value,
      flex: 0,
      minimumRows: 0,
      preferredRows:
        focusedActivity === undefined ? 0 : ACTIVITY_LEAD_RHYTHM_ROWS,
      priority: ACTIVITY_LEAD_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: activityColumn.value,
      flex: 0,
      minimumRows: focusedActivity === undefined ? 0 : 1,
      preferredRows: activityRows,
      priority: 5,
    }),
    Object.freeze({
      component: completionColumn.value,
      flex: 0,
      minimumRows: commandCompletion === undefined ? 0 : 1,
      preferredRows: commandCompletion?.items.length ?? 0,
      priority: 6,
    }),
    Object.freeze({
      component: composerColumn.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: composerHeight.value.preferredRows,
      priority: 7,
    }),
    Object.freeze({
      component: bottomChrome.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: 1,
      priority: 4,
    }),
  ]);
  const layout = VerticalLayout.create(slots);
  if (!layout.ok) return layout;
  const planned = layout.value.plan(viewport);
  if (!planned.ok) return planned;
  const documentGeometry = planned.value.allocation(DOCUMENT_SLOT);
  if (!documentGeometry.ok) return documentGeometry;
  const frame = planned.value.render();
  return frame.ok
    ? ok(
        Object.freeze({
          frame: frame.value,
          transcript: documentGeometry.value,
        }),
      )
    : frame;
}
