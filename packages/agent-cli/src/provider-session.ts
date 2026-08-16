import type {
  CancellationSignal,
  ModelStream,
  StreamingModel,
} from "@agent/runtime";
import type { Conversation, Result } from "@agent/core";
import { err, ok } from "@agent/core";
import type { ToolDescriptor } from "@agent/tools";

export type ProviderId = "opencodeGo" | "opencodeZen";

export type ProviderPresentation = Readonly<{
  authentication: string;
  displayName: string;
  model: string;
}>;

export type ProviderDefinition<E> = Readonly<{
  id: ProviderId;
  model: StreamingModel<E>;
  presentation: ProviderPresentation;
}>;

export type ProviderSelectionSnapshot = Readonly<{
  id: ProviderId;
  presentation: ProviderPresentation;
  selected: boolean;
}>;

export type ProviderSelectionPort = Readonly<{
  select(id: ProviderId): Result<void, ProviderSessionError>;
  snapshots(): readonly ProviderSelectionSnapshot[];
}>;

export type ProviderSessionErrorKind =
  | "duplicateProvider"
  | "invalidProvider"
  | "invalidProviderCount"
  | "unknownProvider";

/** Content-free failure from the closed session provider selector. */
export class ProviderSessionError {
  readonly #kind: ProviderSessionErrorKind;

  constructor(kind: ProviderSessionErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ProviderSessionErrorKind {
    return this.#kind;
  }
}

function copyPresentation(
  presentation: ProviderPresentation,
): ProviderPresentation {
  return Object.freeze({
    authentication: presentation.authentication,
    displayName: presentation.displayName,
    model: presentation.model,
  });
}

/**
 * Owns one closed provider choice while exposing one StreamingModel port.
 * Selection is explicit and never retries a request through another backend.
 */
export class ProviderSession<E> implements StreamingModel<E> {
  readonly #definitions: readonly ProviderDefinition<E>[];
  #selectedIndex: number;

  private constructor(
    definitions: readonly ProviderDefinition<E>[],
    selectedIndex: number,
  ) {
    this.#definitions = definitions;
    this.#selectedIndex = selectedIndex;
  }

  static create<E>(
    definitions: readonly ProviderDefinition<E>[],
  ): Result<ProviderSession<E>, ProviderSessionError> {
    if (definitions.length < 1 || definitions.length > 2) {
      return err(new ProviderSessionError("invalidProviderCount"));
    }
    const copied: ProviderDefinition<E>[] = [];
    for (const definition of definitions) {
      if (
        definition.id !== "opencodeGo" &&
        definition.id !== "opencodeZen"
      ) {
        return err(new ProviderSessionError("invalidProvider"));
      }
      if (copied.some((entry) => entry.id === definition.id)) {
        return err(new ProviderSessionError("duplicateProvider"));
      }
      copied.push(
        Object.freeze({
          id: definition.id,
          model: definition.model,
          presentation: copyPresentation(definition.presentation),
        }),
      );
    }
    const goIndex = copied.findIndex((entry) => entry.id === "opencodeGo");
    return ok(
      new ProviderSession(
        Object.freeze(copied),
        goIndex >= 0 ? goIndex : 0,
      ),
    );
  }

  get selected(): ProviderSelectionSnapshot {
    const definition = this.#definitions.at(this.#selectedIndex);
    if (definition === undefined) {
      throw new ProviderSessionError("unknownProvider");
    }
    return Object.freeze({
      id: definition.id,
      presentation: definition.presentation,
      selected: true,
    });
  }

  snapshots(): readonly ProviderSelectionSnapshot[] {
    return Object.freeze(
      this.#definitions.map((definition, index) =>
        Object.freeze({
          id: definition.id,
          presentation: definition.presentation,
          selected: index === this.#selectedIndex,
        }),
      ),
    );
  }

  select(id: ProviderId): Result<void, ProviderSessionError> {
    const index = this.#definitions.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return err(new ProviderSessionError("unknownProvider"));
    }
    this.#selectedIndex = index;
    return ok(undefined);
  }

  open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    tools: readonly ToolDescriptor[],
  ): Promise<Result<ModelStream<E>, E>> {
    const definition = this.#definitions.at(this.#selectedIndex);
    if (definition === undefined) {
      throw new ProviderSessionError("unknownProvider");
    }
    return definition.model.open(conversation, cancellation, tools);
  }
}
