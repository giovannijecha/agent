import {
  err,
  ok,
  type Result,
  StructuredList,
  StructuredObject,
  type StructuredValue,
  structuredValueCodeUnits,
  structuredValueFromUnknown,
  ToolCall,
  ToolResult,
} from "@agent/core";

import { ObjectSchema, validateSchema } from "./schema.js";

export const TOOL_ENGINE_LIMITS = Object.freeze({
  approvalFields: 8,
  approvalPreviewCodeUnits: 8_192,
  descriptionCodeUnits: 1_024,
  minimumOutputCodeUnits: 23,
  outputCodeUnits: 262_144,
  tools: 64,
});

export type ToolRisk = "execute" | "read" | "write";

export type ToolDescriptorErrorKind =
  | "invalidApproval"
  | "invalidDescription"
  | "invalidName"
  | "invalidRisk"
  | "invalidSchema";
export type ToolDescriptorError = Readonly<{
  kind: ToolDescriptorErrorKind;
}>;

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

export type ToolApprovalField = Readonly<{
  mode: "exact" | "size";
  name: string;
}>;

export class ToolDescriptor {
  readonly #approvalFields: readonly ToolApprovalField[];
  readonly #description: string;
  readonly #input: ObjectSchema;
  readonly #name: string;
  readonly #risk: ToolRisk;

  private constructor(
    name: string,
    description: string,
    risk: ToolRisk,
    input: ObjectSchema,
    approvalFields: readonly ToolApprovalField[],
  ) {
    this.#name = name;
    this.#description = description;
    this.#risk = risk;
    this.#input = input;
    this.#approvalFields = Object.freeze(
      approvalFields.map((field) => Object.freeze({ ...field })),
    );
    Object.freeze(this);
  }

  static create(
    name: string,
    description: string,
    risk: ToolRisk,
    input: ObjectSchema,
    approvalFields: readonly ToolApprovalField[] = Object.freeze([]),
  ): Result<ToolDescriptor, ToolDescriptorError> {
    try {
      if (typeof name !== "string" || !VALID_TOOL_NAME.test(name)) {
        return err(Object.freeze({ kind: "invalidName" as const }));
      }
      if (
        typeof description !== "string" ||
        description.trim().length === 0 ||
        description.length > TOOL_ENGINE_LIMITS.descriptionCodeUnits ||
        /\p{Cc}/u.test(description)
      ) {
        return err(Object.freeze({ kind: "invalidDescription" as const }));
      }
      if (risk !== "read" && risk !== "write" && risk !== "execute") {
        return err(Object.freeze({ kind: "invalidRisk" as const }));
      }
      if (!(input instanceof ObjectSchema)) {
        return err(Object.freeze({ kind: "invalidSchema" as const }));
      }
      if (
        !Array.isArray(approvalFields) ||
        approvalFields.length > TOOL_ENGINE_LIMITS.approvalFields ||
        (risk !== "read" && approvalFields.length === 0)
      ) {
        return err(Object.freeze({ kind: "invalidApproval" as const }));
      }
      const fieldNames = new Set<string>();
      const ownedApproval: ToolApprovalField[] = [];
      for (const field of approvalFields) {
        const keys = Object.keys(field).sort().join(",");
        const fieldName = field.name;
        const mode = field.mode;
        if (
          keys !== "mode,name" ||
          typeof fieldName !== "string" ||
          (mode !== "exact" && mode !== "size") ||
          fieldNames.has(fieldName) ||
          !input.fields.some((candidate) => candidate.name === fieldName)
        ) {
          return err(Object.freeze({ kind: "invalidApproval" as const }));
        }
        fieldNames.add(fieldName);
        ownedApproval.push(Object.freeze({ mode, name: fieldName }));
      }
      return ok(
        new ToolDescriptor(name, description, risk, input, ownedApproval),
      );
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidSchema" as const }));
    }
  }

  get description(): string {
    return this.#description;
  }

  get approvalFields(): readonly ToolApprovalField[] {
    return this.#approvalFields;
  }

  get input(): ObjectSchema {
    return this.#input;
  }

  get name(): string {
    return this.#name;
  }

  get risk(): ToolRisk {
    return this.#risk;
  }
}

export interface ToolCancellation {
  readonly requested: boolean;
  whenRequested(): Promise<void>;
}

export type ToolHandlerErrorKind =
  | "cancelled"
  | "conflict"
  | "io"
  | "limit"
  | "notFound"
  | "permission"
  | "unsupported";
export type ToolHandlerError = Readonly<{ kind: ToolHandlerErrorKind }>;

export type ToolHandlerOutcomeStatus = "failure" | "success";

const TOOL_HANDLER_OUTCOME_TOKEN = Symbol("owned tool handler outcome");

/**
 * An explicit post-invocation outcome. A failed outcome preserves bounded
 * command output for model recovery without misreporting the call as success.
 */
export class ToolHandlerOutcome {
  readonly #output: unknown;
  readonly #status: ToolHandlerOutcomeStatus;

  private constructor(
    token: symbol,
    status: ToolHandlerOutcomeStatus,
    output: unknown,
  ) {
    if (token !== TOOL_HANDLER_OUTCOME_TOKEN) {
      throw new TypeError("invalid tool handler outcome construction");
    }
    this.#status = status;
    this.#output = output;
    Object.freeze(this);
  }

  static failure(output: unknown): ToolHandlerOutcome {
    return new ToolHandlerOutcome(
      TOOL_HANDLER_OUTCOME_TOKEN,
      "failure",
      output,
    );
  }

  static success(output: unknown): ToolHandlerOutcome {
    return new ToolHandlerOutcome(
      TOOL_HANDLER_OUTCOME_TOKEN,
      "success",
      output,
    );
  }

  get output(): unknown {
    return this.#output;
  }

  get status(): ToolHandlerOutcomeStatus {
    return this.#status;
  }
}

export type ToolHandler = (
  input: StructuredObject,
  cancellation: ToolCancellation,
) => Promise<Result<ToolHandlerOutcome, ToolHandlerError>>;

export type ToolRegistration = Readonly<{
  descriptor: ToolDescriptor;
  handler: ToolHandler;
}>;

export type ToolRegistryErrorKind =
  | "duplicateName"
  | "invalidDescriptor"
  | "invalidHandler"
  | "tooManyTools";
export type ToolRegistryError = Readonly<{ kind: ToolRegistryErrorKind }>;

type OwnedRegistration = Readonly<{
  descriptor: ToolDescriptor;
  handler: ToolHandler;
}>;

export class ToolRegistry {
  readonly #descriptors: readonly ToolDescriptor[];
  readonly #registrations: readonly OwnedRegistration[];

  private constructor(registrations: readonly OwnedRegistration[]) {
    this.#registrations = Object.freeze([...registrations]);
    this.#descriptors = Object.freeze(
      registrations.map((registration) => registration.descriptor),
    );
    Object.freeze(this);
  }

  static create(
    registrations: readonly ToolRegistration[],
  ): Result<ToolRegistry, ToolRegistryError> {
    try {
      if (!Array.isArray(registrations)) {
        return err(Object.freeze({ kind: "invalidDescriptor" as const }));
      }
      if (registrations.length > TOOL_ENGINE_LIMITS.tools) {
        return err(Object.freeze({ kind: "tooManyTools" as const }));
      }
      const names = new Set<string>();
      const owned: OwnedRegistration[] = [];
      for (const registration of registrations) {
        let descriptor: unknown;
        let handler: unknown;
        descriptor = registration.descriptor;
        handler = registration.handler;
        if (
          descriptor === null ||
          typeof descriptor !== "object" ||
          !(descriptor instanceof ToolDescriptor)
        ) {
          return err(Object.freeze({ kind: "invalidDescriptor" as const }));
        }
        if (typeof handler !== "function") {
          return err(Object.freeze({ kind: "invalidHandler" as const }));
        }
        const ownedDescriptor = descriptor as ToolDescriptor;
        const ownedHandler = handler as ToolHandler;
        if (names.has(ownedDescriptor.name)) {
          return err(Object.freeze({ kind: "duplicateName" as const }));
        }
        names.add(ownedDescriptor.name);
        owned.push(
          Object.freeze({
            descriptor: ownedDescriptor,
            handler: ownedHandler,
          }),
        );
      }
      return ok(new ToolRegistry(owned));
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidDescriptor" as const }));
    }
  }

  get descriptors(): readonly ToolDescriptor[] {
    return this.#descriptors;
  }

  find(name: string): OwnedRegistration | undefined {
    return this.#registrations.find(
      (registration) => registration.descriptor.name === name,
    );
  }
}

export type ToolPrepareErrorKind =
  | "invalidCall"
  | "invalidInput"
  | "unknownTool";
export type ToolPrepareError = Readonly<{ kind: ToolPrepareErrorKind }>;

export interface PreparedToolCall {
  readonly approvalPreview: string;
  readonly call: ToolCall;
  readonly descriptor: ToolDescriptor;
}

class OwnedPreparedToolCall implements PreparedToolCall {
  readonly #approvalPreview: string;
  readonly #call: ToolCall;
  readonly #registration: OwnedRegistration;

  constructor(
    call: ToolCall,
    registration: OwnedRegistration,
    approvalPreview: string,
  ) {
    this.#call = call;
    this.#registration = registration;
    this.#approvalPreview = approvalPreview;
    Object.freeze(this);
  }

  get call(): ToolCall {
    return this.#call;
  }

  get approvalPreview(): string {
    return this.#approvalPreview;
  }

  get descriptor(): ToolDescriptor {
    return this.#registration.descriptor;
  }

  run(
    cancellation: ToolCancellation,
  ): Promise<Result<ToolHandlerOutcome, ToolHandlerError>> {
    return this.#registration.handler(this.#call.input, cancellation);
  }
}

const UNSAFE_APPROVAL_SCALAR = /[\p{C}\p{Zl}\p{Zp}]/u;

function safeString(value: string): string {
  let visible = "";
  for (const scalar of value) {
    const point = scalar.codePointAt(0);
    visible +=
      point !== undefined && UNSAFE_APPROVAL_SCALAR.test(scalar)
        ? "\\u{" + point.toString(16).padStart(4, "0") + "}"
        : scalar;
  }
  const encoded = JSON.stringify(visible);
  return typeof encoded === "string" ? encoded : "\"\"";
}

function exactApprovalValue(value: StructuredValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return safeString(value);
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (value instanceof StructuredList) {
    return (
      "[" + value.values.map((item) => exactApprovalValue(item)).join(",") + "]"
    );
  }
  return (
    "{" +
    value.fields
      .map((field) => field.name + ":" + exactApprovalValue(field.value))
      .join(",") +
    "}"
  );
}

function sizedApprovalValue(value: StructuredValue): string {
  return typeof value === "string"
    ? "<" + String(value.length) + " code units>"
    : value instanceof StructuredList
      ? "<" + String(value.length) + " items>"
      : value instanceof StructuredObject
        ? "<" + String(value.size) + " fields>"
        : exactApprovalValue(value);
}

function approvalPreview(
  descriptor: ToolDescriptor,
  input: StructuredObject,
): string | undefined {
  const parts: string[] = [];
  for (const field of descriptor.approvalFields) {
    const value = input.get(field.name);
    if (value === undefined) {
      continue;
    }
    parts.push(
      field.name +
        "=" +
        (field.mode === "exact"
          ? exactApprovalValue(value)
          : sizedApprovalValue(value)),
    );
  }
  const preview = parts.join(" ");
  return preview.length <= TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits
    ? preview
    : undefined;
}

export type ToolEngineErrorKind =
  | "invalidHandlerResult"
  | "invalidLimit"
  | "invalidOutput"
  | "invalidPreparedCall"
  | "unexpectedHandler";
export type ToolEngineError = Readonly<{ kind: ToolEngineErrorKind }>;
export type ToolEngineCreateError = Readonly<{ kind: "invalidRegistry" }>;
export type ToolExecution = Readonly<{
  call: ToolCall;
  /** True when the handler ran but violated its owned result contract. */
  contractFailure: boolean;
  result: ToolResult;
}>;

type ResultSnapshot =
  | Readonly<{ error: unknown; ok: false }>
  | Readonly<{ ok: true; value: unknown }>;

function readResult(value: unknown): ResultSnapshot | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  try {
    const candidate = value as Readonly<{
      error?: unknown;
      ok?: unknown;
      value?: unknown;
    }>;
    const keys = Object.keys(value).sort().join(",");
    if (candidate.ok === true && keys === "ok,value") {
      return Object.freeze({ ok: true as const, value: candidate.value });
    }
    if (candidate.ok === false && keys === "error,ok") {
      return Object.freeze({ error: candidate.error, ok: false as const });
    }
  } catch (_cause: unknown) {
    return undefined;
  }
  return undefined;
}

type HandlerOutcomeSnapshot = Readonly<{
  output: unknown;
  status: ToolHandlerOutcomeStatus;
}>;

function readHandlerOutcome(value: unknown): HandlerOutcomeSnapshot | undefined {
  try {
    if (!(value instanceof ToolHandlerOutcome)) {
      return undefined;
    }
    const status = value.status;
    if (status !== "failure" && status !== "success") {
      return undefined;
    }
    return Object.freeze({ output: value.output, status });
  } catch (_cause: unknown) {
    return undefined;
  }
}

function handlerErrorKind(value: unknown): ToolHandlerErrorKind | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  try {
    const candidate = value as Readonly<{ kind?: unknown }>;
    if (Object.keys(value).join(",") !== "kind") {
      return undefined;
    }
    const kind = candidate.kind;
    return kind === "cancelled" ||
      kind === "conflict" ||
      kind === "io" ||
      kind === "limit" ||
      kind === "notFound" ||
      kind === "permission" ||
      kind === "unsupported"
      ? kind
      : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function failureOutput(
  kind:
    | ToolHandlerErrorKind
    | "blocked"
    | "denied"
    | "internal",
): StructuredObject {
  const output = structuredValueFromUnknown({ error: kind });
  if (!output.ok || !(output.value instanceof StructuredObject)) {
    throw new Error("owned tool failure invariant");
  }
  return output.value;
}

function notRunOutput(reason: "blocked" | "cancelled"): StructuredObject {
  const output = structuredValueFromUnknown({ attempted: false, error: reason });
  if (!output.ok || !(output.value instanceof StructuredObject)) {
    throw new Error("owned tool not-run invariant");
  }
  return output.value;
}

function execution(
  prepared: OwnedPreparedToolCall,
  status: "failure" | "success",
  output: unknown,
  contractFailure = false,
  outputCodeUnits: number = TOOL_ENGINE_LIMITS.outputCodeUnits,
): Result<ToolExecution, ToolEngineError> {
  const value = structuredValueFromUnknown(output);
  if (!value.ok) {
    return err(Object.freeze({ kind: "invalidOutput" as const }));
  }
  if (structuredValueCodeUnits(value.value) > outputCodeUnits) {
    return err(Object.freeze({ kind: "invalidOutput" as const }));
  }
  const result = ToolResult.create(
    prepared.call.callId,
    prepared.call.name,
    status,
    value.value,
  );
  return result.ok
    ? ok(
        Object.freeze({
          call: prepared.call,
          contractFailure,
          result: result.value,
        }),
      )
    : err(Object.freeze({ kind: "invalidOutput" as const }));
}

function failedHandlerContract(
  prepared: OwnedPreparedToolCall,
  outputCodeUnits: number = TOOL_ENGINE_LIMITS.outputCodeUnits,
): Result<ToolExecution, ToolEngineError> {
  return execution(
    prepared,
    "failure",
    failureOutput("internal"),
    true,
    outputCodeUnits,
  );
}

/** Closed registry, schema validator, and hostile handler boundary. */
export class ToolEngine {
  readonly #registry: ToolRegistry;

  private constructor(registry: ToolRegistry) {
    this.#registry = registry;
    Object.freeze(this);
  }

  static create(
    registry: ToolRegistry,
  ): Result<ToolEngine, ToolEngineCreateError> {
    try {
      return registry instanceof ToolRegistry &&
        Array.isArray(registry.descriptors)
        ? ok(new ToolEngine(registry))
        : err(Object.freeze({ kind: "invalidRegistry" as const }));
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidRegistry" as const }));
    }
  }

  get descriptors(): readonly ToolDescriptor[] {
    return this.#registry.descriptors;
  }

  prepare(
    callId: string,
    name: string,
    input: unknown,
  ): Result<PreparedToolCall, ToolPrepareError> {
    try {
      const registration = this.#registry.find(name);
      if (registration === undefined) {
        return err(Object.freeze({ kind: "unknownTool" as const }));
      }
      const snapshot = structuredValueFromUnknown(input);
      if (!snapshot.ok || !(snapshot.value instanceof StructuredObject)) {
        return err(Object.freeze({ kind: "invalidInput" as const }));
      }
      const valid = validateSchema(registration.descriptor.input, snapshot.value);
      if (!valid.ok) {
        return err(Object.freeze({ kind: "invalidInput" as const }));
      }
      const call = ToolCall.create(callId, name, snapshot.value);
      if (!call.ok) {
        return err(Object.freeze({ kind: "invalidCall" as const }));
      }
      const preview = approvalPreview(registration.descriptor, snapshot.value);
      return preview === undefined
        ? err(Object.freeze({ kind: "invalidInput" as const }))
        : ok(new OwnedPreparedToolCall(call.value, registration, preview));
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidCall" as const }));
    }
  }

  deny(
    prepared: PreparedToolCall,
  ): Result<ToolExecution, ToolEngineError> {
    try {
      if (!(prepared instanceof OwnedPreparedToolCall)) {
        return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
      }
      return execution(prepared, "failure", failureOutput("denied"));
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
    }
  }

  /** Creates a truthful result for a prepared call whose handler was not run. */
  notRun(
    prepared: PreparedToolCall,
    reason: "blocked" | "cancelled",
  ): Result<ToolExecution, ToolEngineError> {
    try {
      if (!(prepared instanceof OwnedPreparedToolCall)) {
        return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
      }
      return execution(
        prepared,
        "failure",
        notRunOutput(reason),
      );
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
    }
  }

  async execute(
    prepared: PreparedToolCall,
    cancellation: ToolCancellation,
    outputCodeUnits: number = TOOL_ENGINE_LIMITS.outputCodeUnits,
  ): Promise<Result<ToolExecution, ToolEngineError>> {
    let owned: OwnedPreparedToolCall;
    try {
      if (!(prepared instanceof OwnedPreparedToolCall)) {
        return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
      }
      if (
        typeof outputCodeUnits !== "number" ||
        !Number.isSafeInteger(outputCodeUnits) ||
        outputCodeUnits < TOOL_ENGINE_LIMITS.minimumOutputCodeUnits ||
        outputCodeUnits > TOOL_ENGINE_LIMITS.outputCodeUnits
      ) {
        return err(Object.freeze({ kind: "invalidLimit" as const }));
      }
      owned = prepared;
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
    }
    let foreign: unknown;
    try {
      foreign = await owned.run(cancellation);
    } catch (_cause: unknown) {
      return failedHandlerContract(owned, outputCodeUnits);
    }
    const result = readResult(foreign);
    if (result === undefined) {
      return failedHandlerContract(owned, outputCodeUnits);
    }
    if (result.ok) {
      const outcome = readHandlerOutcome(result.value);
      if (outcome === undefined) {
        return failedHandlerContract(owned, outputCodeUnits);
      }
      const executed = execution(
        owned,
        outcome.status,
        outcome.output,
        false,
        outputCodeUnits,
      );
      return executed.ok
        ? executed
        : failedHandlerContract(owned, outputCodeUnits);
    }
    const kind = handlerErrorKind(result.error);
    return kind === undefined
      ? failedHandlerContract(owned, outputCodeUnits)
      : execution(
          owned,
          "failure",
          failureOutput(kind),
          false,
          outputCodeUnits,
        );
  }
}
