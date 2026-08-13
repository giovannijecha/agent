import {
  activityPulseTones,
  type Component,
  ComponentError,
  type Frame,
  InputArea,
  ok,
  type Result,
  ScrollView,
  Surface,
  TextBlock,
  ThreeColumnLine,
  TUI_LIMITS,
  type MotionPhase,
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
import { CONVERSATION_DENSITY } from "./conversation-density.js";
import {
  createConversationStage,
  projectConversationStage,
} from "./conversation-stage.js";
import { createConversationDocument } from "./conversation-view.js";
import { isMotionActive } from "./motion-policy.js";
import { createSpacer, createSpan } from "./view-components.js";

const DOCUMENT_SLOT = 0;
const COMPOSER_SLOT = 8;
const CONVERSATION_RHYTHM_PRIORITY = 6;
const COMPOSER_MAXIMUM_CONTENT_ROWS = 6;

export type ChatRender = Readonly<{
  composer: VerticalAllocation;
  frame: Frame;
  stage: Readonly<{ columns: number; left: number }>;
  transcript: VerticalAllocation;
}>;

function createFooter(
  application: ApplicationController,
  motionPhase: MotionPhase,
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
  const right = [];
  if (isMotionActive(application.phase)) {
    const pulseTones = activityPulseTones(motionPhase);
    for (const tone of pulseTones) {
      const cell = createSpan("\u2022", tone);
      if (!cell.ok) return cell;
      right.push(cell.value);
    }
  }
  return ThreeColumnLine.create(left, center, right, { gap: 2 });
}

function createDocument(
  application: ApplicationController,
): Result<Component, ComponentError> {
  return createConversationDocument(
    application.transcriptEntries(),
    application.transcriptSelection,
  );
}

function createNotice(
  application: ApplicationController,
): Result<Component, ComponentError> {
  const lines = application.noticePlacement === "context"
    ? application.notice
    : Object.freeze([]);
  const text = TextBlock.create(
    lines.join("\n"),
    "tail",
    application.noticeLevel === "warning" ? "attention" : "muted",
  );
  if (!text.ok) return text;
  return Surface.create(text.value, {
    extent: "viewport",
    horizontalPadding: 1,
    slant: "inherit",
    surface: "none",
    verticalPadding: 0,
  });
}

function createComposer(
  application: ApplicationController,
): Result<Component, ComponentError> {
  const notice = application.noticePlacement === "composer"
    ? application.notice.at(0)
    : undefined;
  const input = InputArea.create(application, {
    maximumRows: COMPOSER_MAXIMUM_CONTENT_ROWS,
    textTone: "plain",
    ...(notice === undefined
      ? {}
      : {
          trailingStatus: Object.freeze({
            text: notice,
            tone: application.noticeLevel === "warning"
              ? "attention" as const
              : "muted" as const,
          }),
        }),
  });
  if (!input.ok) return input;
  const surface = Surface.create(input.value, {
    extent: "viewport",
    horizontalPadding: 1,
    slant: "inherit",
    surface: "subtle",
    verticalPadding: CONVERSATION_DENSITY.composerVerticalPadding,
  });
  return surface;
}

/** Maps CLI state onto one planned generic conversation shell and safe frame. */
export function createChatRender(
  application: ApplicationController,
  viewport: Viewport,
  motionPhase: MotionPhase = 0,
): Result<ChatRender, ComponentError> {
  const focusedActivity = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  const contextualNoticeVisible =
    application.noticePlacement === "context" &&
    application.notice.length > 0;
  const document = createDocument(application);
  if (!document.ok) return document;
  const documentView = ScrollView.create(
    document.value,
    application.transcriptScroll,
  );
  if (!documentView.ok) return documentView;
  const documentColumn = createConversationStage(documentView.value);
  if (!documentColumn.ok) return documentColumn;

  const notice = createNotice(application);
  if (!notice.ok) return notice;
  const noticeColumn = createConversationStage(notice.value);
  if (!noticeColumn.ok) return noticeColumn;
  const noticeHeight = noticeColumn.value.measure(viewport.columns);
  if (!noticeHeight.ok) return noticeHeight;

  const activity = createActivityDocument(focusedActivity);
  if (!activity.ok) return activity;
  const activityColumn = createConversationStage(activity.value);
  if (!activityColumn.ok) return activityColumn;
  let activityRows = 0;
  if (focusedActivity !== undefined) {
    const activityHeight = activityColumn.value.measure(viewport.columns);
    if (!activityHeight.ok) return activityHeight;
    activityRows = activityHeight.value.preferredRows;
  }
  const conversationRhythm = createSpacer(CONVERSATION_DENSITY.rhythmRows);
  if (!conversationRhythm.ok) return conversationRhythm;

  const commandCompletion = application.projectCommandCompletion();
  const completion = createCommandCompletionDocument(commandCompletion);
  if (!completion.ok) return completion;
  const completionColumn = createConversationStage(completion.value);
  if (!completionColumn.ok) return completionColumn;
  const completionHeight = completionColumn.value.measure(viewport.columns);
  if (!completionHeight.ok) return completionHeight;

  const composer = createComposer(application);
  if (!composer.ok) return composer;
  const composerColumn = createConversationStage(composer.value);
  if (!composerColumn.ok) return composerColumn;
  const composerHeight = composerColumn.value.measure(viewport.columns);
  if (!composerHeight.ok) return composerHeight;

  const footer = createFooter(application, motionPhase);
  if (!footer.ok) return footer;
  const footerColumn = createConversationStage(footer.value);
  if (!footerColumn.ok) return footerColumn;

  const slots: readonly VerticalSlot[] = Object.freeze([
    Object.freeze({
      component: documentColumn.value,
      flex: 1,
      minimumRows: 2,
      preferredRows: TUI_LIMITS.frameRows,
      priority: 3,
    }),
    Object.freeze({
      component: conversationRhythm.value,
      flex: 0,
      minimumRows: 0,
      preferredRows:
        focusedActivity === undefined ? 0 : CONVERSATION_DENSITY.rhythmRows,
      priority: CONVERSATION_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: activityColumn.value,
      flex: 0,
      minimumRows: focusedActivity === undefined ? 0 : 1,
      preferredRows: activityRows,
      priority: 5,
    }),
    Object.freeze({
      component: conversationRhythm.value,
      flex: 0,
      minimumRows: 0,
      preferredRows:
        !contextualNoticeVisible
          ? 0
          : CONVERSATION_DENSITY.rhythmRows,
      priority: CONVERSATION_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: noticeColumn.value,
      flex: 0,
      minimumRows: contextualNoticeVisible ? 1 : 0,
      preferredRows:
        !contextualNoticeVisible
          ? 0
          : noticeHeight.value.preferredRows,
      priority: 5,
    }),
    Object.freeze({
      component: conversationRhythm.value,
      flex: 0,
      minimumRows: 0,
      preferredRows:
        commandCompletion === undefined
          ? 0
          : CONVERSATION_DENSITY.rhythmRows,
      priority: CONVERSATION_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: completionColumn.value,
      flex: 0,
      minimumRows: commandCompletion === undefined ? 0 : 1,
      preferredRows:
        commandCompletion === undefined
          ? 0
          : completionHeight.value.preferredRows,
      priority: 6,
    }),
    Object.freeze({
      component: conversationRhythm.value,
      flex: 0,
      minimumRows: 0,
      preferredRows: CONVERSATION_DENSITY.rhythmRows,
      priority: CONVERSATION_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: composerColumn.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: composerHeight.value.preferredRows,
      priority: 7,
    }),
    Object.freeze({
      component: conversationRhythm.value,
      flex: 0,
      minimumRows: 0,
      preferredRows: CONVERSATION_DENSITY.rhythmRows,
      priority: CONVERSATION_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: footerColumn.value,
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
  const composerGeometry = planned.value.allocation(COMPOSER_SLOT);
  if (!composerGeometry.ok) return composerGeometry;
  const frame = planned.value.render();
  return frame.ok
    ? ok(
        Object.freeze({
          composer: composerGeometry.value,
          frame: frame.value,
          stage: projectConversationStage(viewport),
          transcript: documentGeometry.value,
        }),
      )
    : frame;
}
