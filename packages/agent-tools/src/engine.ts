import {
  err,
  ok,
  type Result,
  StructuredObject,
  structuredValueCodeUnits,
  structuredValueFromUnknown,
  ToolCall,
  ToolResult,
} from "@agent/core";

import {
  renderStructuredProjection,
  type StructuredProjectionField,
} from "./projection.js";
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

export type ToolApprovalField = StructuredProjectionField;

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
      const projection = input.projection;
      let projectionMatchesApproval = true;
      if (projection !== undefined) {
        const approvalFields = ownedApproval.values();
        for (const field of projection.fields) {
          const approvalField = approvalFields.next();
          if (
            approvalField.done ||
            field.name !== approvalField.value.name ||
            field.mode !== approvalField.value.mode
          ) {
            projectionMatchesApproval = false;
            break;
          }
        }
      }
      if (
        projection !== undefined &&
        (projection.maximumCodeUnits !==
          TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits ||
          projection.fields.length !== ownedApproval.length ||
          !projectionMatchesApproval)
      ) {
        return err(Object.freeze({ kind: "invalidApproval" as const }));
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

export type ToolEffectPlanErrorKind = "invalidHandler" | "invalidPreview";
export type ToolEffectPlanError = Readonly<{
  kind: ToolEffectPlanErrorKind;
}>;

const TOOL_EFFECT_PLAN_TOKEN = Symbol("owned tool effect plan");
const UNSAFE_APPROVAL_PREVIEW = /[\p{C}\p{Zl}\p{Zp}]/u;

/** One bounded concrete effect and its exact post-approval invocation. */
export class ToolEffectPlan {
  readonly #approvalPreview: string;
  readonly #handler: ToolHandler;

  private constructor(
    token: symbol,
    approvalPreview: string,
    handler: ToolHandler,
  ) {
    if (token !== TOOL_EFFECT_PLAN_TOKEN) {
      throw new TypeError("invalid tool effect plan construction");
    }
    this.#approvalPreview = approvalPreview;
    this.#handler = handler;
    Object.freeze(this);
  }

  static create(
    approvalPreview: string,
    handler: ToolHandler,
  ): Result<ToolEffectPlan, ToolEffectPlanError> {
    if (
      typeof approvalPreview !== "string" ||
      approvalPreview.length === 0 ||
      approvalPreview.length > TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits ||
      UNSAFE_APPROVAL_PREVIEW.test(approvalPreview)
    ) {
      return err(Object.freeze({ kind: "invalidPreview" as const }));
    }
    if (typeof handler !== "function") {
      return err(Object.freeze({ kind: "invalidHandler" as const }));
    }
    return ok(
      new ToolEffectPlan(TOOL_EFFECT_PLAN_TOKEN, approvalPreview, handler),
    );
  }

  get approvalPreview(): string {
    return this.#approvalPreview;
  }

  invoke(
    input: StructuredObject,
    cancellation: ToolCancellation,
  ): Promise<Result<ToolHandlerOutcome, ToolHandlerError>> {
    return this.#handler(input, cancellation);
  }
}

export type ToolPlanner = (
  input: StructuredObject,
  cancellation: ToolCancellation,
) => Promise<Result<ToolEffectPlan, ToolHandlerError>>;

export type ToolRegistration = Readonly<{
  descriptor: ToolDescriptor;
  handler?: ToolHandler;
  planner?: ToolPlanner;
}>;

export type ToolRegistryErrorKind =
  | "duplicateName"
  | "invalidDescriptor"
  | "invalidHandler"
  | "invalidPlanner"
  | "tooManyTools";
export type ToolRegistryError = Readonly<{ kind: ToolRegistryErrorKind }>;

type OwnedRegistration = Readonly<{
  descriptor: ToolDescriptor;
  handler: ToolHandler | undefined;
  planner: ToolPlanner | undefined;
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
        let planner: unknown;
        descriptor = registration.descriptor;
        handler = registration.handler;
        planner = registration.planner;
        if (
          descriptor === null ||
          typeof descriptor !== "object" ||
          !(descriptor instanceof ToolDescriptor)
        ) {
          return err(Object.freeze({ kind: "invalidDescriptor" as const }));
        }
        if (
          (handler !== undefined && typeof handler !== "function") ||
          (handler === undefined && planner === undefined)
        ) {
          return err(Object.freeze({ kind: "invalidHandler" as const }));
        }
        if (
          (planner !== undefined && typeof planner !== "function") ||
          (planner !== undefined && handler !== undefined) ||
          (planner !== undefined && descriptor.risk === "read")
        ) {
          return err(Object.freeze({ kind: "invalidPlanner" as const }));
        }
        const ownedDescriptor = descriptor as ToolDescriptor;
        const ownedHandler = handler as ToolHandler | undefined;
        if (names.has(ownedDescriptor.name)) {
          return err(Object.freeze({ kind: "duplicateName" as const }));
        }
        names.add(ownedDescriptor.name);
        owned.push(
          Object.freeze({
            descriptor: ownedDescriptor,
            handler: ownedHandler,
            planner: planner as ToolPlanner | undefined,
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
  readonly call: ToolCall;
  readonly descriptor: ToolDescriptor;
}

class OwnedPreparedToolCall implements PreparedToolCall {
  readonly #call: ToolCall;
  readonly #registration: OwnedRegistration;

  constructor(
    call: ToolCall,
    registration: OwnedRegistration,
  ) {
    this.#call = call;
    this.#registration = registration;
    Object.freeze(this);
  }

  get call(): ToolCall {
    return this.#call;
  }

  get descriptor(): ToolDescriptor {
    return this.#registration.descriptor;
  }

  get registration(): OwnedRegistration {
    return this.#registration;
  }
}

export interface PlannedToolCall {
  readonly approvalPreview: string;
  readonly approvalRequired: boolean;
  readonly call: ToolCall;
  readonly descriptor: ToolDescriptor;
}

class OwnedPlannedToolCall implements PlannedToolCall {
  readonly #approvalPreview: string;
  readonly #approvalRequired: boolean;
  readonly #contractFailure: boolean;
  readonly #error: ToolHandlerError | undefined;
  readonly #handler: ToolHandler | undefined;
  readonly #prepared: OwnedPreparedToolCall;

  constructor(
    prepared: OwnedPreparedToolCall,
    approvalPreview: string,
    approvalRequired: boolean,
    handler: ToolHandler | undefined,
    error: ToolHandlerError | undefined,
    contractFailure: boolean,
  ) {
    this.#prepared = prepared;
    this.#approvalPreview = approvalPreview;
    this.#approvalRequired = approvalRequired;
    this.#handler = handler;
    this.#error = error;
    this.#contractFailure = contractFailure;
    Object.freeze(this);
  }

  get approvalPreview(): string {
    return this.#approvalPreview;
  }

  get approvalRequired(): boolean {
    return this.#approvalRequired;
  }

  get call(): ToolCall {
    return this.#prepared.call;
  }

  get contractFailure(): boolean {
    return this.#contractFailure;
  }

  get descriptor(): ToolDescriptor {
    return this.#prepared.descriptor;
  }

  get prepared(): OwnedPreparedToolCall {
    return this.#prepared;
  }

  run(
    cancellation: ToolCancellation,
  ): Promise<Result<ToolHandlerOutcome, ToolHandlerError>> {
    if (this.#error !== undefined) {
      return Promise.resolve(err(this.#error));
    }
    const handler = this.#handler;
    if (handler === undefined) {
      return Promise.reject(new Error("owned planned call invariant"));
    }
    return handler(this.call.input, cancellation);
  }
}

function approvalPreview(
  descriptor: ToolDescriptor,
  input: StructuredObject,
): string | undefined {
  return renderStructuredProjection(
    descriptor.approvalFields,
    input,
    TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits,
  );
}

export type ToolEngineErrorKind =
  | "invalidHandlerResult"
  | "invalidLimit"
  | "invalidOutput"
  | "invalidPlannedCall"
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

function planningContractFailure(
  prepared: OwnedPreparedToolCall,
): OwnedPlannedToolCall {
  return new OwnedPlannedToolCall(
    prepared,
    "",
    false,
    undefined,
    undefined,
    true,
  );
}

function plannedFailure(
  prepared: OwnedPreparedToolCall,
  kind: ToolHandlerErrorKind,
): OwnedPlannedToolCall {
  return new OwnedPlannedToolCall(
    prepared,
    "",
    false,
    undefined,
    Object.freeze({ kind }),
    false,
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
      return ok(new OwnedPreparedToolCall(call.value, registration));
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidCall" as const }));
    }
  }

  /** Prepares one just-in-time immutable invocation after batch validation. */
  async plan(
    prepared: PreparedToolCall,
    cancellation: ToolCancellation,
  ): Promise<Result<PlannedToolCall, ToolEngineError>> {
    let owned: OwnedPreparedToolCall;
    try {
      if (!(prepared instanceof OwnedPreparedToolCall)) {
        return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
      }
      owned = prepared;
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidPreparedCall" as const }));
    }
    const registration = owned.registration;
    const planner = registration.planner;
    if (planner === undefined) {
      const handler = registration.handler;
      const preview = approvalPreview(
        registration.descriptor,
        owned.call.input,
      );
      return preview === undefined || handler === undefined
        ? ok(planningContractFailure(owned))
        : ok(
            new OwnedPlannedToolCall(
              owned,
              preview,
              registration.descriptor.risk !== "read",
              handler,
              undefined,
              false,
            ),
          );
    }
    let foreign: unknown;
    try {
      foreign = await planner(owned.call.input, cancellation);
    } catch (_cause: unknown) {
      return ok(planningContractFailure(owned));
    }
    const result = readResult(foreign);
    if (result === undefined) {
      return ok(planningContractFailure(owned));
    }
    if (!result.ok) {
      const kind = handlerErrorKind(result.error);
      return ok(
        kind === undefined
          ? planningContractFailure(owned)
          : plannedFailure(owned, kind),
      );
    }
    try {
      if (!(result.value instanceof ToolEffectPlan)) {
        return ok(planningContractFailure(owned));
      }
      const effectPlan = result.value;
      const preview = effectPlan.approvalPreview;
      return ok(
        new OwnedPlannedToolCall(
          owned,
          preview,
          true,
          (input, signal) => effectPlan.invoke(input, signal),
          undefined,
          false,
        ),
      );
    } catch (_cause: unknown) {
      return ok(planningContractFailure(owned));
    }
  }

  deny(
    planned: PlannedToolCall,
  ): Result<ToolExecution, ToolEngineError> {
    try {
      if (!(planned instanceof OwnedPlannedToolCall)) {
        return err(Object.freeze({ kind: "invalidPlannedCall" as const }));
      }
      return execution(
        planned.prepared,
        "failure",
        failureOutput("denied"),
      );
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidPlannedCall" as const }));
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
    planned: PlannedToolCall,
    cancellation: ToolCancellation,
    outputCodeUnits: number = TOOL_ENGINE_LIMITS.outputCodeUnits,
  ): Promise<Result<ToolExecution, ToolEngineError>> {
    let owned: OwnedPlannedToolCall;
    try {
      if (!(planned instanceof OwnedPlannedToolCall)) {
        return err(Object.freeze({ kind: "invalidPlannedCall" as const }));
      }
      if (
        typeof outputCodeUnits !== "number" ||
        !Number.isSafeInteger(outputCodeUnits) ||
        outputCodeUnits < TOOL_ENGINE_LIMITS.minimumOutputCodeUnits ||
        outputCodeUnits > TOOL_ENGINE_LIMITS.outputCodeUnits
      ) {
        return err(Object.freeze({ kind: "invalidLimit" as const }));
      }
      owned = planned;
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidPlannedCall" as const }));
    }
    if (owned.contractFailure) {
      return failedHandlerContract(owned.prepared, outputCodeUnits);
    }
    let foreign: unknown;
    try {
      foreign = await owned.run(cancellation);
    } catch (_cause: unknown) {
      return failedHandlerContract(owned.prepared, outputCodeUnits);
    }
    const result = readResult(foreign);
    if (result === undefined) {
      return failedHandlerContract(owned.prepared, outputCodeUnits);
    }
    if (result.ok) {
      const outcome = readHandlerOutcome(result.value);
      if (outcome === undefined) {
        return failedHandlerContract(owned.prepared, outputCodeUnits);
      }
      const executed = execution(
        owned.prepared,
        outcome.status,
        outcome.output,
        false,
        outputCodeUnits,
      );
      return executed.ok
        ? executed
        : failedHandlerContract(owned.prepared, outputCodeUnits);
    }
    const kind = handlerErrorKind(result.error);
    return kind === undefined
      ? failedHandlerContract(owned.prepared, outputCodeUnits)
      : execution(
          owned.prepared,
          "failure",
          failureOutput(kind),
          false,
          outputCodeUnits,
        );
  }
}
