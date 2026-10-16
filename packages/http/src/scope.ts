/**
 * The time limits and the stop of one call (roadmap R38).
 *
 * A call stops at the first of these events:
 * - the signal of the call aborts (`ctx.signal`): the caller went away, or the server stops;
 * - the deadline of the call passes (`ctx.capability.deadline`);
 * - the time of the input passes (`timeoutMs`);
 * - a stream gets no data for the idle time of the input (`idleTimeoutMs`).
 *
 * The earliest event wins. The stop aborts the request, and the call fails with `TIMEOUT` or
 * `ABORTED`.
 */

import { InvocationError, type ProcedurePath } from "@procedures/client";

/** The cause of a stop. */
export type StopReason = "timeout" | "idle" | "deadline" | "aborted";

/** The longest delay of `setTimeout`. A later time gets no timer: the call cannot last so long. */
const MAX_TIMER_MS = 2_147_483_647;

/** The parts of the context of a handler that a scope reads. */
export interface ScopeContext {
  readonly signal?: AbortSignal | undefined;
  readonly capability?: { readonly deadline?: number | undefined } | undefined;
}

/** The time limits of a scope, in milliseconds. */
export interface ScopeLimits {
  /** The time of the whole call. */
  readonly timeoutMs?: number | undefined;
  /** The longest time without data. */
  readonly idleTimeoutMs?: number | undefined;
}

/** The stop of one call: one abort signal for the request, and the error of the stop. */
export class CallScope {
  readonly #controller = new AbortController();
  readonly #timers: ReturnType<typeof setTimeout>[] = [];
  readonly #parent: AbortSignal | undefined;
  readonly #onAbort = (): void => this.stop("aborted");
  #idle: ReturnType<typeof setTimeout> | undefined;
  #reason: StopReason | undefined;

  constructor(
    readonly path: ProcedurePath,
    context: ScopeContext,
    readonly limits: ScopeLimits = {},
  ) {
    this.#parent = context.signal;
    if (this.#parent?.aborted) {
      this.stop("aborted");
      return;
    }
    this.#parent?.addEventListener("abort", this.#onAbort, { once: true });
    if (limits.timeoutMs !== undefined) this.#later(limits.timeoutMs, () => this.stop("timeout"));
    const deadline = context.capability?.deadline;
    if (deadline !== undefined) this.#later(Math.max(0, deadline - Date.now()), () => this.stop("deadline"));
    this.touch();
  }

  #later(ms: number, stop: () => void): void {
    if (ms <= MAX_TIMER_MS) this.#timers.push(setTimeout(stop, ms));
  }

  /** The signal that aborts the request at the stop. */
  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  /** The cause of the stop, or undefined while the call runs. */
  get reason(): StopReason | undefined {
    return this.#reason;
  }

  /** This function stops the call. The first cause wins. */
  stop(reason: StopReason): void {
    if (this.#reason !== undefined) return;
    this.#reason = reason;
    this.#clearIdle();
    this.#controller.abort(this.error());
  }

  /** This function starts the idle time again: data arrived. */
  touch(): void {
    const idle = this.limits.idleTimeoutMs;
    if (idle === undefined || this.#reason !== undefined) return;
    this.#clearIdle();
    if (idle <= MAX_TIMER_MS) this.#idle = setTimeout(() => this.stop("idle"), idle);
  }

  /** This function holds the idle time while the reader of a stream has an item and reads no data. */
  pause(): void {
    this.#clearIdle();
  }

  #clearIdle(): void {
    if (this.#idle !== undefined) clearTimeout(this.#idle);
    this.#idle = undefined;
  }

  /** The error of the stop. Before a stop, an `ABORTED` error. */
  error(): InvocationError {
    const key = this.path.join(".");
    switch (this.#reason) {
      case "timeout":
        return new InvocationError("TIMEOUT", `${key}: the call took more than ${this.limits.timeoutMs} ms (timeoutMs)`, this.path);
      case "idle":
        return new InvocationError("TIMEOUT", `${key}: no data arrived in ${this.limits.idleTimeoutMs} ms (idleTimeoutMs)`, this.path);
      case "deadline":
        return new InvocationError("TIMEOUT", `${key}: the deadline of the call passed`, this.path);
      default:
        return new InvocationError("ABORTED", `${key}: the caller aborted the call`, this.path);
    }
  }

  /** The error to throw for a failure: the error of the stop after a stop, or the failure. */
  translate(error: unknown): unknown {
    return this.#reason !== undefined ? this.error() : error;
  }

  /** This function removes the timers and the listener. */
  dispose(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.length = 0;
    this.#clearIdle();
    this.#parent?.removeEventListener("abort", this.#onAbort);
  }
}
