/** Bounded per-item text fragments joined only when one item completes. */
export class BoundedTextChunks {
  readonly #chunks = new Map<string, string[]>();
  #codeUnits = 0;
  readonly #maximumCodeUnits: number;

  constructor(maximumCodeUnits: number) {
    if (!Number.isSafeInteger(maximumCodeUnits) || maximumCodeUnits < 1) {
      throw new RangeError("invalid text chunk bound");
    }
    this.#maximumCodeUnits = maximumCodeUnits;
  }

  get pending(): boolean {
    return this.#chunks.size !== 0;
  }

  append(id: string, value: string): boolean {
    if (id.length < 1 || value.length < 1) return false;
    const nextCodeUnits = this.#codeUnits + value.length;
    if (nextCodeUnits > this.#maximumCodeUnits) return false;
    const chunks = this.#chunks.get(id);
    if (chunks === undefined) this.#chunks.set(id, [value]);
    else chunks.push(value);
    this.#codeUnits = nextCodeUnits;
    return true;
  }

  complete(id: string): string | undefined {
    const chunks = this.#chunks.get(id);
    if (chunks === undefined) return undefined;
    this.#chunks.delete(id);
    return chunks.join("");
  }

  release(): void {
    this.#chunks.clear();
    this.#codeUnits = 0;
  }
}
