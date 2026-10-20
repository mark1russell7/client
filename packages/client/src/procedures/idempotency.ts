/**
 * Idempotency of calls (roadmap R1).
 *
 * The retry middleware gives each call one idempotency key, and each try of the call sends the
 * same key. `ProcedureServer` keeps the result of a keyed call to a procedure that is not
 * repeatable. A second try with the same key gets that result, and the handler does not run
 * again. So a retry cannot do a write two times.
 */

import type { Method } from "../client/types.js";
import { methodToPath } from "../server/method.js";
import type { AnyProcedure, Effects, ProcedurePath } from "./types.js";
import { optionalMs, type Duration } from "../duration.js";
import { TIMER_DEFAULTS } from "../timers.js";

// This file imports no module of the invocation, so the retry middleware stays small in a browser

/** The metadata key of the idempotency key of a call. Each try of one call sends the same key. */
export const IDEMPOTENCY_KEY_METADATA = "idempotency-key";

/** The longest idempotency key that a server accepts. A longer key is ignored. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

/**
 * True when a second call with the same input changes nothing more: the procedure is idempotent,
 * or it changes nothing (`writes: []`). Undeclared effects are not repeatable.
 */
export function isRepeatable(effects: Effects | undefined): boolean {
  if (effects === undefined) return false;
  if (effects.idempotent === true) return true;
  return effects.writes !== undefined && effects.writes.length === 0;
}

/**
 * This function gives the `idempotent` option of the retry middleware from the procedures that
 * the client knows: true for a repeatable procedure, false for another one, and undefined for a
 * path that the registry does not have.
 */
export function idempotentIn(registry: { get(path: ProcedurePath): AnyProcedure | undefined }): (method: Method) => boolean | undefined {
  return (method) => {
    const procedure = registry.get(methodToPath(method));
    if (procedure === undefined) return undefined;
    const effects = (procedure.metadata as { effects?: Effects } | undefined)?.effects;
    return isRepeatable(effects !== null && typeof effects === "object" ? effects : undefined);
  };
}

/**
 * This function gives the effects of the procedures that the client knows, by method: the
 * `effects` option of the cache middleware (roadmap R13). A path that the registry does not have
 * gives undefined.
 */
export function effectsIn(registry: { get(path: ProcedurePath): AnyProcedure | undefined }): (method: Method) => Effects | undefined {
  return (method) => {
    const effects = (registry.get(methodToPath(method))?.metadata as { effects?: Effects } | undefined)?.effects;
    return effects !== null && typeof effects === "object" ? effects : undefined;
  };
}

/** This function makes a new idempotency key: a random UUID. */
export function newIdempotencyKey(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (random) return random.call(globalThis.crypto);
  // An older runtime without randomUUID: 128 random bits from Math.random
  let key = "";
  for (let index = 0; index < 4; index++) key += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return key;
}

/** The idempotency key of a call, from its metadata, or undefined. */
export function idempotencyKeyOf(metadata: Record<string, unknown> | undefined): string | undefined {
  const key = metadata?.[IDEMPOTENCY_KEY_METADATA];
  return typeof key === "string" && key.length > 0 && key.length <= MAX_IDEMPOTENCY_KEY_LENGTH ? key : undefined;
}

/** The options of the idempotency cache of a server. */
export interface IdempotencyOptions {
  /** How long the server keeps a result after the call ends. The default is 10 minutes. */
  readonly ttl?: Duration;
  /** The most results that the server keeps. The oldest finished result goes first. The default is 1000. */
  readonly maxEntries?: number;
  /** The clock of the cache, in milliseconds. The default is `Date.now`. */
  readonly now?: () => number;
}

interface Entry<T> {
  readonly done: Promise<T>;
  /** The end time of the call, or undefined while it runs. */
  settledAt: number | undefined;
}

/**
 * The results of keyed calls. The first call with a key runs. A call with the same key while the
 * first runs waits for it. A later call gets the same result until the time to live ends.
 */
export class IdempotencyCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: IdempotencyOptions = {}) {
    this.ttlMs = optionalMs(options.ttl, "ttl") ?? TIMER_DEFAULTS.idempotency.ttlMs;
    this.maxEntries = options.maxEntries ?? 1000;
    this.now = options.now ?? Date.now;
  }

  /** The number of results and calls that the cache holds. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * The result of the call with this key. `run` starts only for the first call. `keep` tells if
   * the cache keeps a result: a result that is not kept lets the next call with the key run again.
   */
  run(key: string, run: () => Promise<T>, keep: (result: T) => boolean): { result: Promise<T>; first: boolean } {
    this.evict();
    const existing = this.entries.get(key);
    if (existing) return { result: existing.done, first: false };
    const entry: Entry<T> = {
      done: run().then(
        (result) => {
          if (keep(result)) entry.settledAt = this.now();
          else if (this.entries.get(key) === entry) this.entries.delete(key);
          return result;
        },
        (error: unknown) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          throw error;
        },
      ),
      settledAt: undefined,
    };
    this.entries.set(key, entry);
    return { result: entry.done, first: true };
  }

  /**
   * This method removes the result of a key, so the next call with the key runs again. It removes
   * the entry only when `result` is its result: an entry of a newer call with the key stays.
   */
  forget(key: string, result: Promise<T>): void {
    if (this.entries.get(key)?.done === result) this.entries.delete(key);
  }

  /** This function removes the expired results, and the oldest finished results above the limit. */
  private evict(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.settledAt !== undefined && now - entry.settledAt >= this.ttlMs) this.entries.delete(key);
    }
    if (this.entries.size < this.maxEntries) return;
    // A Map keeps the order of insertion, so the first finished entries are the oldest
    for (const [key, entry] of this.entries) {
      if (this.entries.size < this.maxEntries) break;
      if (entry.settledAt !== undefined) this.entries.delete(key);
    }
  }
}
