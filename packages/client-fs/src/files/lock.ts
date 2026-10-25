/**
 * A lock in the process for each key (roadmap O51). One holder at a time has a key. The other
 * callers wait in the order of their calls, or they skip their work.
 */

/** The function that gives the lock back. A second call does nothing. */
export type LockRelease = () => void;

/** The options of a call that waits when the lock has a holder. */
export interface LockWaitOptions {
  /** With `wait` (the default), the call waits for the lock. */
  ifHeld?: "wait" | undefined;
  /** The abort of this signal stops the wait. The call then rejects with the reason of the signal. */
  signal?: AbortSignal | undefined;
}

/** The options of a call that skips its work when the lock has a holder. */
export interface LockSkipOptions {
  /** With `skip`, the call does not start the function when the lock has a holder. */
  ifHeld: "skip";
}

/** The result of a call with `ifHeld: "skip"`: the value of the function, or `ran: false` when the lock had a holder. */
export type LockOutcome<T> = { readonly ran: true; readonly value: T } | { readonly ran: false };

/** A caller that waits for a key. */
interface Waiter {
  readonly grant: (release: LockRelease) => void;
  readonly detach: () => void;
}

/**
 * A set of locks, one for each key, in one process. Each instance has its own keys.
 *
 * - One holder at a time has a key. The waiters get the key in the order of their calls.
 * - The lock is not reentrant. A holder that asks for its own key again waits for ever.
 * - A key without a holder uses no memory.
 */
export class KeyedLock {
  /** The waiters of each key that has a holder. A key without a holder is not in the map. */
  private readonly queues = new Map<string, Waiter[]>();

  /** The number of keys that have a holder. */
  get size(): number {
    return this.queues.size;
  }

  /** This method tells if the key has a holder. */
  isHeld(key: string): boolean {
    return this.queues.has(key);
  }

  /** This method takes the key when it has no holder. Otherwise it gives `undefined` and does not wait. */
  tryAcquire(key: string): LockRelease | undefined {
    if (this.queues.has(key)) return undefined;
    this.queues.set(key, []);
    return this.releaseOf(key);
  }

  /**
   * This method gives the key to the caller. When the key has a holder, the caller waits after the
   * other waiters. The abort of `options.signal` stops the wait.
   */
  acquire(key: string, options: { signal?: AbortSignal | undefined } = {}): Promise<LockRelease> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(signal.reason);
    const release = this.tryAcquire(key);
    if (release) return Promise.resolve(release);
    const queue = this.queues.get(key) ?? [];
    return new Promise<LockRelease>((resolve, reject) => {
      const onAbort = (): void => {
        const index = queue.indexOf(waiter);
        if (index !== -1) queue.splice(index, 1);
        reject(signal?.reason);
      };
      const waiter: Waiter = {
        grant: resolve,
        detach: () => signal?.removeEventListener("abort", onAbort),
      };
      queue.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * This method starts `fn` with the key, and gives the key back when `fn` ends or throws.
   * With `ifHeld: "skip"`, it does not start `fn` when the key has a holder.
   */
  run<T>(key: string, fn: () => T | PromiseLike<T>, options?: LockWaitOptions): Promise<T>;
  run<T>(key: string, fn: () => T | PromiseLike<T>, options: LockSkipOptions): Promise<LockOutcome<T>>;
  async run<T>(
    key: string,
    fn: () => T | PromiseLike<T>,
    options: LockWaitOptions | LockSkipOptions = {},
  ): Promise<T | LockOutcome<T>> {
    if (options.ifHeld === "skip") {
      const release = this.tryAcquire(key);
      if (!release) return { ran: false };
      try {
        return { ran: true, value: await fn() };
      } finally {
        release();
      }
    }
    const release = await this.acquire(key, { signal: options.signal });
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** The release of one turn of the key. It gives the key to the first waiter, or removes the key. */
  private releaseOf(key: string): LockRelease {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const queue = this.queues.get(key);
      const next = queue?.shift();
      if (next) {
        next.detach();
        next.grant(this.releaseOf(key));
      } else {
        this.queues.delete(key);
      }
    };
  }
}

let shared: KeyedLock | undefined;

/**
 * This function starts `fn` with the key of the lock of the process, and gives the key back when
 * `fn` ends or throws. The callers of one key run one at a time, in the order of their calls.
 *
 * - With `ifHeld: "skip"`, the function does not start `fn` when the key has a holder. It gives `{ ran: false }`.
 * - All the callers in the process share the keys. For keys of your own, make a `KeyedLock`.
 */
export function withLock<T>(key: string, fn: () => T | PromiseLike<T>, options?: LockWaitOptions): Promise<T>;
export function withLock<T>(key: string, fn: () => T | PromiseLike<T>, options: LockSkipOptions): Promise<LockOutcome<T>>;
export function withLock<T>(
  key: string,
  fn: () => T | PromiseLike<T>,
  options?: LockWaitOptions | LockSkipOptions,
): Promise<T | LockOutcome<T>> {
  shared ??= new KeyedLock();
  return options?.ifHeld === "skip" ? shared.run(key, fn, options) : shared.run(key, fn, options);
}
