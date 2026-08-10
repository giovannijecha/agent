/** Public terminal UI surface for agent. */

export {
  ComponentError,
  type Component,
  type ComponentErrorKind,
  type ComponentMeasurement,
} from "./component.js";
export { ComponentStack, type StackAnchor } from "./component-stack.js";
export {
  Frame,
  FrameError,
  type Caret,
  type FrameErrorKind,
} from "./frame.js";
export { Fragment, type FragmentCaret } from "./fragment.js";
export {
  HorizontalInset,
  type HorizontalInsetOptions,
} from "./horizontal-inset.js";
export { InlineText } from "./inline-text.js";
export { InputLine, type InputProjectionSource } from "./input-line.js";
export { InputDecoder, type KeyEvent } from "./input-decoder.js";
export {
  LineEditor,
  type EditorOutcome,
  type EditorProjection,
} from "./line-editor.js";
export { MarkdownBlock } from "./markdown-block.js";
export { Panel, type PanelOptions } from "./panel.js";
export { TUI_LIMITS } from "./limits.js";
export type { TextOutput } from "./output.js";
export { Renderer } from "./renderer.js";
export {
  RichRow,
  RichRowError,
  TextSpan,
  type RichRowErrorKind,
} from "./rich-row.js";
export { err, ok, type Result } from "./result.js";
export {
  ScrollError,
  type ScrollErrorKind,
  ScrollState,
} from "./scroll-state.js";
export { ScrollView } from "./scroll-view.js";
export { SideRail, type SideRailOptions } from "./side-rail.js";
export {
  SplitLine,
  type SplitLineOptions,
  type SplitPriority,
} from "./split-line.js";
export { TextBlock, type TextAnchor } from "./text-block.js";
export { type Tone } from "./tone.js";
export {
  type VerticalAllocation,
  VerticalLayout,
  type VerticalLayoutPlan,
  type VerticalSlot,
} from "./vertical-layout.js";
export { Viewport, ViewportError } from "./viewport.js";
