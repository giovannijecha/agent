import type {
  CancellationSignal,
  ModelStream,
  ModelTurnOptions,
  StreamingModel,
} from "@agent/runtime";
import type { Conversation, Result } from "@agent/core";
import { err, ok } from "@agent/core";
import type { ToolDescriptor } from "@agent/tools";

import { isValidOllamaCloudCredential } from "./provider-configuration.js";
import {
  isProviderId,
  type ProviderId,
} from "./provider-identity.js";
import type {
  ProviderModelCatalog,
  ProviderModelCatalogError,
} from "./provider-model-catalog.js";

export type { ProviderId } from "./provider-identity.js";

export type ProviderModelCost = "cloud";

export type ProviderPresentation = Readonly<{
  authentication: string;
  displayName: string;
  model: string | undefined;
}>;

export type ProviderDefinition<E> = Readonly<{
  acceptsModel(id: string): boolean;
  createModel(
    credential: string,
    model: string,
  ): StreamingModel<E> | undefined;
  id: ProviderId;
  presentation: Readonly<{
    authentication: string;
    displayName: string;
  }>;
}>;

export type ProviderSelectionSnapshot = Readonly<{
  configured: boolean;
  id: ProviderId;
  presentation: ProviderPresentation;
  ready: boolean;
  selected: boolean;
}>;

export type ProviderModelSnapshot = Readonly<{
  cost: ProviderModelCost;
  id: string;
  selected: boolean;
}>;

export type ProviderSelectionPort = Readonly<{
  clear(): void;
  listModels(
    id: ProviderId,
  ): Promise<
    Result<readonly ProviderModelSnapshot[], ProviderSessionModelsError>
  >;
  ready(): boolean;
  selectProviderModel(
    providerId: ProviderId,
    modelId: string,
  ): Result<void, ProviderSessionError>;
  snapshots(): readonly ProviderSelectionSnapshot[];
}>;

export type ProviderAdmission = Readonly<{ active(): boolean }>;

export type ProviderSessionErrorKind =
  | "invalidCredential"
  | "invalidModel"
  | "invalidProvider"
  | "invalidProviderCount"
  | "modelCreationFailed"
  | "modelNotAvailable"
  | "modelNotSelected"
  | "noActiveProvider"
  | "providerAdmissionLost"
  | "providerNotConfigured"
  | "unknownProvider";

export type ProviderSessionModelsError =
  | Readonly<{ kind: "catalog"; error: ProviderModelCatalogError }>
  | Readonly<{ kind: "session"; error: ProviderSessionError }>;

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

type RetainedProvider<E> = {
  acceptsModel(id: string): boolean;
  catalog: readonly string[] | undefined;
  createModel(
    credential: string,
    model: string,
  ): StreamingModel<E> | undefined;
  credential: string | undefined;
  admission: ProviderAdmission | undefined;
  id: ProviderId;
  model: StreamingModel<E> | undefined;
  modelId: string | undefined;
  presentation: Readonly<{
    authentication: string;
    displayName: string;
  }>;
};

function credentialValid(id: ProviderId, credential: string): boolean {
  return id === "ollamaCloud" && isValidOllamaCloudCredential(credential);
}

function sessionModelsError(
  kind: ProviderSessionErrorKind,
): ProviderSessionModelsError {
  return Object.freeze({
    error: new ProviderSessionError(kind),
    kind: "session" as const,
  });
}

/**
 * Owns one admitted process-memory credential snapshot and one active model port.
 * Configuration, catalogs, selections, and adapters are released on clear.
 */
export class ProviderSession<E> implements StreamingModel<E> {
  readonly #listModels: ProviderModelCatalog["list"];
  readonly #providers: RetainedProvider<E>[];
  #selectedIndex: number | undefined;

  private constructor(
    providers: RetainedProvider<E>[],
    listModels: ProviderModelCatalog["list"],
  ) {
    this.#providers = providers;
    this.#listModels = listModels;
    this.#selectedIndex = undefined;
  }

  static create<E>(
    definitions: readonly ProviderDefinition<E>[],
    catalog: ProviderModelCatalog,
  ): Result<ProviderSession<E>, ProviderSessionError> {
    try {
      if (definitions.length !== 1) {
        return err(new ProviderSessionError("invalidProviderCount"));
      }
      if (
        catalog === null ||
        typeof catalog !== "object" ||
        typeof catalog.list !== "function"
      ) {
        return err(new ProviderSessionError("invalidProvider"));
      }
      const listModels = catalog.list.bind(catalog);
      const copied: RetainedProvider<E>[] = [];
      for (const definition of definitions) {
        const id = definition.id;
        const acceptsModel = definition.acceptsModel;
        const createModel = definition.createModel;
        const presentation = definition.presentation;
        if (
          !isProviderId(id) ||
          typeof acceptsModel !== "function" ||
          typeof createModel !== "function" ||
          typeof presentation?.authentication !== "string" ||
          typeof presentation.displayName !== "string"
        ) {
          return err(new ProviderSessionError("invalidProvider"));
        }
        copied.push({
          acceptsModel: acceptsModel.bind(definition) as (id: string) => boolean,
          admission: undefined,
          catalog: undefined,
          createModel,
          credential: undefined,
          id,
          model: undefined,
          modelId: undefined,
          presentation: Object.freeze({
            authentication: presentation.authentication,
            displayName: presentation.displayName,
          }),
        });
      }
      return ok(new ProviderSession(copied, listModels));
    } catch (_cause: unknown) {
      return err(new ProviderSessionError("invalidProvider"));
    }
  }

  clear(): void {
    for (const provider of this.#providers) {
      provider.catalog = undefined;
      provider.admission = undefined;
      provider.credential = undefined;
      provider.model = undefined;
      provider.modelId = undefined;
    }
    this.#selectedIndex = undefined;
  }

  admit(
    id: ProviderId,
    credential: string,
    admission: ProviderAdmission,
  ): Result<void, ProviderSessionError> {
    const index = this.#providers.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return err(new ProviderSessionError("unknownProvider"));
    }
    let active = false;
    try {
      active = admission?.active() === true;
    } catch (_cause: unknown) {
      active = false;
    }
    if (!credentialValid(id, credential) || !active) {
      return err(new ProviderSessionError("invalidCredential"));
    }
    const provider = this.#providers.at(index);
    if (provider === undefined) {
      return err(new ProviderSessionError("unknownProvider"));
    }
    provider.catalog = undefined;
    provider.admission = admission;
    provider.credential = credential;
    provider.model = undefined;
    provider.modelId = undefined;
    return ok(undefined);
  }

  ready(): boolean {
    const provider = this.#active();
    return provider?.model !== undefined && this.#admissionActive(provider);
  }

  snapshots(): readonly ProviderSelectionSnapshot[] {
    return Object.freeze(
      this.#providers.map((provider, index) => {
        const active = provider.credential !== undefined &&
          this.#admissionActive(provider);
        return Object.freeze({
          configured: active,
          id: provider.id,
          presentation: Object.freeze({
            authentication: provider.presentation.authentication,
            displayName: provider.presentation.displayName,
            model: active ? provider.modelId : undefined,
          }),
          ready: active && provider.model !== undefined,
          selected: active && index === this.#selectedIndex,
        });
      }),
    );
  }

  async listModels(id: ProviderId): Promise<
    Result<readonly ProviderModelSnapshot[], ProviderSessionModelsError>
  > {
    const provider = this.#providers.find((entry) => entry.id === id);
    if (provider === undefined) {
      return err(sessionModelsError("unknownProvider"));
    }
    if (provider.credential === undefined) {
      return err(sessionModelsError("providerNotConfigured"));
    }
    if (!this.#admissionActive(provider)) {
      return err(sessionModelsError("providerAdmissionLost"));
    }
    provider.catalog = undefined;
    let listed: Result<readonly string[], ProviderModelCatalogError>;
    try {
      listed = await this.#listModels(provider.id, provider.credential);
    } catch (_cause: unknown) {
      return err(sessionModelsError("modelNotAvailable"));
    }
    if (!listed.ok) {
      return err(Object.freeze({ kind: "catalog" as const, error: listed.error }));
    }
    let available: readonly string[];
    try {
      available = Object.freeze(
        listed.value.filter((model) => provider.acceptsModel(model)),
      );
    } catch (_cause: unknown) {
      provider.catalog = undefined;
      return err(sessionModelsError("modelNotAvailable"));
    }
    if (available.length === 0) {
      provider.catalog = undefined;
      return err(sessionModelsError("modelNotAvailable"));
    }
    provider.catalog = available;
    return ok(
      Object.freeze(
        available.map((model) =>
          Object.freeze({
            cost: "cloud" as const,
            id: model,
            selected: model === provider.modelId,
          }),
        ),
      ),
    );
  }

  selectProviderModel(
    providerId: ProviderId,
    modelId: string,
  ): Result<void, ProviderSessionError> {
    const index = this.#providers.findIndex((entry) => entry.id === providerId);
    const provider = index < 0 ? undefined : this.#providers.at(index);
    if (provider === undefined) {
      return err(new ProviderSessionError("unknownProvider"));
    }
    if (provider.credential === undefined) {
      return err(new ProviderSessionError("providerNotConfigured"));
    }
    if (!this.#admissionActive(provider)) {
      return err(new ProviderSessionError("providerAdmissionLost"));
    }
    if (
      provider.catalog === undefined || !provider.catalog.includes(modelId)
    ) {
      return err(new ProviderSessionError("modelNotAvailable"));
    }
    let accepted = false;
    try {
      accepted = provider.acceptsModel(modelId);
    } catch (_cause: unknown) {
      accepted = false;
    }
    if (!accepted) {
      return err(new ProviderSessionError("invalidModel"));
    }
    let model: StreamingModel<E> | undefined;
    try {
      model = provider.createModel(provider.credential, modelId);
    } catch (_cause: unknown) {
      model = undefined;
    }
    if (model === undefined) {
      return err(new ProviderSessionError("modelCreationFailed"));
    }
    provider.model = model;
    provider.modelId = modelId;
    this.#selectedIndex = index;
    return ok(undefined);
  }

  open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    tools: readonly ToolDescriptor[],
    options: ModelTurnOptions,
  ): Promise<Result<ModelStream<E>, E>> {
    const model = this.#active()?.model;
    const provider = this.#active();
    if (
      model === undefined || provider === undefined ||
      !this.#admissionActive(provider)
    ) {
      throw new ProviderSessionError("modelNotSelected");
    }
    return model.open(conversation, cancellation, tools, options);
  }

  #active(): RetainedProvider<E> | undefined {
    return this.#selectedIndex === undefined
      ? undefined
      : this.#providers.at(this.#selectedIndex);
  }

  #admissionActive(provider: RetainedProvider<E>): boolean {
    try {
      return provider.admission?.active() === true;
    } catch (_cause: unknown) {
      return false;
    }
  }
}
