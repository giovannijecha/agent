/** Fixed public safety limits for the owned TUI framework. */
export const TUI_LIMITS = Object.freeze({
  componentColumns: 16_384,
  componentCount: 32,
  displayTextCodeUnits: 1_048_576,
  frameLineCodePoints: 16_384,
  frameRows: 4_096,
  rowSpans: 256,
  slotValue: 4_096,
});
