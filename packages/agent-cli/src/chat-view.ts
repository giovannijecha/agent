import {
  activityPulseTones,
  type Component,
  ComponentError,
  err,
  type Frame,
  HorizontalRules,
  InputArea,
  InteractionDock,
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
import { createModelsDocument } from "./models-view.js";
import { createPermissionsDocument } from "./permissions-view.js";
import { createProviderCredentialDocument } from "./provider-credential-view.js";
import { createProvidersDocument } from "./providers-view.js";
import { createTimelineDocument } from "./timeline-view.js";
import { createSpacer, createSpan } from "./view-components.js";

const DOCUMENT_SLOT = 0;
const COMPOSER_SLOT = 8;
const CONVERSATION_RHYTHM_PRIORITY = 6;

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
    if (!name.ok) return name;
    center.push(name.value);
    if (provider.model !== undefined) {
      const model = createSpan(" \u00b7 " + provider.model, "muted");
      if (!model.ok) return model;
      center.push(model.value);
    }
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
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    slant: "inherit",
    surface: "none",
    verticalPadding: CONVERSATION_DENSITY.flushRows,
  });
}

function createComposer(
  application: ApplicationController,
  selection?: Component,
): Result<Component, ComponentError> {
  const credentialEntry = application.projectProviderCredential();
  const notice = application.noticePlacement === "composer"
    ? application.notice.at(0)
    : undefined;
  const trailingStatus = credentialEntry === undefined
    ? notice === undefined
      ? undefined
      : Object.freeze({
          text: notice,
          tone: application.noticeLevel === "warning"
            ? "attention" as const
            : "muted" as const,
        })
    : Object.freeze({
        text: "Enter API key · Ctrl+C cancels",
        tone: "muted" as const,
      });
  let body = selection;
  if (body === undefined) {
    const input = InputArea.create(application, {
      maximumRows: CONVERSATION_DENSITY.interactionDockMaximumRows,
      textTone: "plain",
      ...(trailingStatus === undefined ? {} : { trailingStatus }),
    });
    if (!input.ok) return input;
    const dock = InteractionDock.create(input.value, {
      focus: "editor",
      maximumRows: CONVERSATION_DENSITY.interactionDockMaximumRows,
    });
    if (!dock.ok) return dock;
    body = dock.value;
  }
  return HorizontalRules.create(body, {
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    ruleRows: CONVERSATION_DENSITY.composerRuleRows,
    tone: "accent",
  });
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
  const permissionMenu = application.projectPermissionMenu();
  const toolDecision = application.projectToolDecision();
  const providerMenu = application.projectProviderMenu();
  const modelMenu = application.projectModelMenu();
  const providerCredential = application.projectProviderCredential();
  const timelineMenu = application.projectTimelineMenu();
  const contextCount = [
    permissionMenu,
    toolDecision,
    providerMenu,
    modelMenu,
    providerCredential,
    timelineMenu,
  ].filter((projection) => projection !== undefined).length;
  if (contextCount > 1) {
    return err(new ComponentError("invalidComponent", undefined));
  }
  const permissions = createPermissionsDocument(permissionMenu, toolDecision);
  if (!permissions.ok) return permissions;
  const providers = createProvidersDocument(providerMenu);
  if (!providers.ok) return providers;
  const models = createModelsDocument(modelMenu);
  if (!models.ok) return models;
  const credential = createProviderCredentialDocument(providerCredential);
  if (!credential.ok) return credential;
  const timeline = createTimelineDocument(timelineMenu);
  if (!timeline.ok) return timeline;
  const contextualSelection = providerMenu !== undefined
    ? providers.value
    : modelMenu !== undefined
      ? models.value
      : timelineMenu !== undefined
        ? timeline.value
        : permissionMenu !== undefined || toolDecision !== undefined
          ? permissions.value
          : undefined;
  const completionVisible = providerCredential !== undefined ||
    (contextualSelection === undefined && commandCompletion !== undefined);
  const completion = providerCredential !== undefined
    ? credential
    : createCommandCompletionDocument(
        contextualSelection === undefined ? commandCompletion : undefined,
      );
  if (!completion.ok) return completion;
  const completionColumn = createConversationStage(completion.value);
  if (!completionColumn.ok) return completionColumn;
  const completionHeight = completionColumn.value.measure(viewport.columns);
  if (!completionHeight.ok) return completionHeight;

  const composer = createComposer(application, contextualSelection);
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
        !completionVisible
          ? 0
          : CONVERSATION_DENSITY.rhythmRows,
      priority: CONVERSATION_RHYTHM_PRIORITY,
    }),
    Object.freeze({
      component: completionColumn.value,
      flex: 0,
      minimumRows:
        completionVisible ? 1 : 0,
      preferredRows:
        !completionVisible
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
