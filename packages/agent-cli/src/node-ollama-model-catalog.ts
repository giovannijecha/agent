import {
  request as nodeHttpsRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:https";

import { err, type Result } from "@agent/core";

import { isValidOllamaCloudCredential } from "./provider-configuration.js";
import {
  decodeProviderModelCatalog,
  PROVIDER_MODEL_CATALOG_LIMITS,
  type ProviderModelCatalog,
  type ProviderModelCatalogError,
  type ProviderModelCatalogErrorKind,
} from "./provider-model-catalog.js";
import { NodeTimerClock } from "./node-timer-clock.js";
import type { ScheduledTimer, TimerClock } from "./timer-clock.js";

export const OLLAMA_MODEL_CATALOG_LIMITS = Object.freeze({
  deadlineMilliseconds: 30_000,
  headerBytes: 16_384,
  inactivityMilliseconds: 30_000,
  responseChunkBytes: 65_536,
});

export const OLLAMA_CLOUD_MODELS_ORIGIN = "https://ollama.com";
export const OLLAMA_CLOUD_MODELS_PATH = "/api/tags";

type HttpsResponse = IncomingMessage;
type HttpsRequest = ClientRequest;
type RequestHttps = HttpsClient["request"];

export interface HttpsClient {
  request(
    options: RequestOptions,
    onResponse: (response: HttpsResponse) => void,
  ): HttpsRequest;
}

const NODE_HTTPS_CLIENT: HttpsClient = Object.freeze({
  request: nodeHttpsRequest,
});

function failure(
  kind: ProviderModelCatalogErrorKind,
): ProviderModelCatalogError {
  return Object.freeze({ kind });
}

function contentType(response: HttpsResponse): string | undefined {
  const value = response.headers["content-type"];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length === 1) {
    return value.at(0);
  }
  return undefined;
}

function validJsonContentType(value: string | undefined): boolean {
  return (
    value !== undefined &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(value)
  );
}

function exactOptions(credential: string): RequestOptions {
  return Object.freeze({
    agent: false as const,
    headers: Object.freeze({
      accept: "application/json",
      authorization: "Bearer " + credential,
      "user-agent": "agent/0.1.0",
    }),
    hostname: "ollama.com",
    maxHeaderSize: OLLAMA_MODEL_CATALOG_LIMITS.headerBytes,
    method: "GET" as const,
    path: OLLAMA_CLOUD_MODELS_PATH,
    port: 443 as const,
    protocol: "https:" as const,
  });
}

/** Exact-origin authenticated Ollama Cloud catalog with bounded capture. */
export class NodeOllamaModelCatalog implements ProviderModelCatalog {
  readonly #clock: TimerClock;
  readonly #requestHttps: RequestHttps;

  constructor(
    client: HttpsClient = NODE_HTTPS_CLIENT,
    clock: TimerClock = new NodeTimerClock(),
  ) {
    this.#clock = clock;
    this.#requestHttps = client.request.bind(client) as RequestHttps;
  }

  list(
    provider: "ollamaCloud",
    credential: string,
  ): Promise<Result<readonly string[], ProviderModelCatalogError>> {
    if (
      provider !== "ollamaCloud" ||
      !isValidOllamaCloudCredential(credential)
    ) {
      return Promise.resolve(err(failure("protocol")));
    }
    let settled = false;
    let activeRequest: HttpsRequest | undefined;
    let activeResponse: HttpsResponse | undefined;
    let deadline: ScheduledTimer | undefined;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    return new Promise((resolve) => {
      const cancelDeadline = (): void => {
        const scheduled = deadline;
        deadline = undefined;
        try {
          scheduled?.cancel();
        } catch (_cause: unknown) {
          // Clearing ownership first makes a failed cancellation callback inert.
        }
      };
      const settle = (
        result: Result<readonly string[], ProviderModelCatalogError>,
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (activeResponse !== undefined) {
          activeResponse.off("aborted", onAborted);
          activeResponse.off("data", onData);
          activeResponse.off("end", onEnd);
          activeResponse.off("error", onResponseError);
        }
        activeRequest?.off("error", onRequestError);
        cancelDeadline();
        resolve(result);
      };
      const destroy = (): void => {
        try {
          activeResponse?.destroy();
        } catch (_cause: unknown) {
          activeResponse = undefined;
        }
        try {
          activeRequest?.destroy();
        } catch (_cause: unknown) {
          activeRequest = undefined;
        }
      };
      const fail = (kind: ProviderModelCatalogErrorKind): void => {
        if (settled) {
          return;
        }
        settle(err(failure(kind)));
        destroy();
      };
      const onAborted = (): void => fail("connection");
      const onRequestError = (_cause: unknown): void => fail("connection");
      const onResponseError = (_cause: unknown): void => fail("connection");
      const onData = (chunk: Uint8Array): void => {
        if (
          !(chunk instanceof Uint8Array) ||
          chunk.length < 1 ||
          chunk.length > OLLAMA_MODEL_CATALOG_LIMITS.responseChunkBytes ||
          bytes + chunk.length > PROVIDER_MODEL_CATALOG_LIMITS.bodyBytes
        ) {
          fail("limit");
          return;
        }
        bytes += chunk.length;
        chunks.push(Uint8Array.from(chunk));
      };
      const onEnd = (): void => {
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.length;
        }
        settle(decodeProviderModelCatalog(body));
      };

      let scheduled: ScheduledTimer | undefined;
      let firedSynchronously = false;
      try {
        scheduled = this.#clock.schedule(
          OLLAMA_MODEL_CATALOG_LIMITS.deadlineMilliseconds,
          () => {
            if (deadline === undefined) {
              firedSynchronously = true;
              return;
            }
            if (settled || deadline !== scheduled) {
              return;
            }
            deadline = undefined;
            fail("timeout");
          },
        );
      } catch (_cause: unknown) {
        fail("timeout");
        return;
      }
      if (firedSynchronously) {
        try {
          scheduled.cancel();
        } catch (_cause: unknown) {
          // A synchronously fired registration retains no deadline authority.
        }
        fail("timeout");
        return;
      }
      deadline = scheduled;

      try {
        activeRequest = this.#requestHttps(
          exactOptions(credential),
          (response) => {
            if (settled) {
              response.destroy();
              return;
            }
            activeResponse = response;
            const status = response.statusCode;
            if (status !== 200) {
              fail("status");
              return;
            }
            if (!validJsonContentType(contentType(response))) {
              fail("contentType");
              return;
            }
            response.on("aborted", onAborted);
            response.on("data", onData);
            response.on("end", onEnd);
            response.on("error", onResponseError);
            response.resume();
          },
        );
        activeRequest.on("error", onRequestError);
        activeRequest.setTimeout(
          OLLAMA_MODEL_CATALOG_LIMITS.inactivityMilliseconds,
          () => fail("timeout"),
        );
        activeRequest.end();
      } catch (_cause: unknown) {
        fail("connection");
      }
    });
  }
}
