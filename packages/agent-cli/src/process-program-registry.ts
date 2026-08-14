import path from "node:path";

import { err, ok, type Result } from "@agent/core";

/** Exact model-facing tokens admitted by the current process registry. */
export const PROCESS_PROGRAM_TOKENS = Object.freeze({
  node: "node" as const,
});

export type ProcessProgramToken = "node";

export type ProcessProgramRegistration = Readonly<{
  executable: string;
  token: ProcessProgramToken;
}>;

export type ProcessProgramRegistryError = Readonly<{
  kind: "invalidExecutable";
}>;

/** Closed CLI-owned mapping from model tokens to absolute executables. */
export class ProcessProgramRegistry {
  readonly #node: ProcessProgramRegistration;

  private constructor(nodeExecutable: string) {
    this.#node = Object.freeze({
      executable: nodeExecutable,
      token: PROCESS_PROGRAM_TOKENS.node,
    });
    Object.freeze(this);
  }

  static create(
    nodeExecutable: unknown,
  ): Result<ProcessProgramRegistry, ProcessProgramRegistryError> {
    if (
      typeof nodeExecutable !== "string" ||
      !path.isAbsolute(nodeExecutable) ||
      nodeExecutable.includes("\u0000")
    ) {
      return err(Object.freeze({ kind: "invalidExecutable" as const }));
    }
    return ok(new ProcessProgramRegistry(nodeExecutable));
  }

  resolve(token: string): ProcessProgramRegistration | undefined {
    return token === PROCESS_PROGRAM_TOKENS.node ? this.#node : undefined;
  }
}
