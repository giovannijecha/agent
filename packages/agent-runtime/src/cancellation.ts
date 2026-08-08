/** Read-only cooperative cancellation observed by a streaming model. */
export interface CancellationSignal {
  /** Whether cancellation has already been requested. */
  readonly requested: boolean;
  /** Returns one stable promise that resolves exactly once on cancellation. */
  whenRequested(): Promise<void>;
}

class OwnedCancellationSignal implements CancellationSignal {
  readonly #source: CancellationSource;

  constructor(source: CancellationSource) {
    this.#source = source;
    Object.freeze(this);
  }

  get requested(): boolean {
    return this.#source.requested;
  }

  whenRequested(): Promise<void> {
    return this.#source.whenRequested;
  }
}

/** Mutable cancellation owner retained only by the runtime. */
export class CancellationSource {
  readonly #signal: CancellationSignal;
  readonly #whenRequested: Promise<void>;
  #resolveRequest: () => void = () => undefined;
  #requested = false;

  constructor() {
    this.#whenRequested = new Promise((resolve) => {
      this.#resolveRequest = resolve;
    });
    this.#signal = new OwnedCancellationSignal(this);
  }

  get signal(): CancellationSignal {
    return this.#signal;
  }

  get requested(): boolean {
    return this.#requested;
  }

  get whenRequested(): Promise<void> {
    return this.#whenRequested;
  }

  /** Requests cancellation once and reports whether this call changed state. */
  request(): boolean {
    if (this.#requested) {
      return false;
    }
    this.#requested = true;
    this.#resolveRequest();
    return true;
  }
}
