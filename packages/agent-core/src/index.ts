/** Public immutable domain surface for agent. */

export {
  Conversation,
  conversationEntryCodeUnits,
  conversationEntryMessageUnits,
  Message,
  MessageError,
  Role,
  ToolCall,
  ToolEntryError,
  ToolExchange,
  ToolExchangeError,
  TOOL_EXCHANGE_LIMITS,
  ToolResult,
  type ConversationEntry,
  type MessageErrorKind,
  type Role as RoleValue,
  type ToolEntryErrorKind,
  type ToolExchangeErrorKind,
  type ToolResultStatus,
} from "./conversation.js";
export { err, ok, type Result } from "./result.js";
export { scalarUtf8ByteLength } from "./text.js";
export {
  STRUCTURED_VALUE_LIMITS,
  StructuredList,
  StructuredObject,
  StructuredValueError,
  structuredValueCodeUnits,
  structuredValueFromUnknown,
  type StructuredField,
  type StructuredScalar,
  type StructuredValue,
  type StructuredValueErrorKind,
} from "./structured-value.js";
