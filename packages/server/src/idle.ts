/**
 * The idle stop of a procedures host (CLI-27).
 *
 * A host with the option `idle` of `runProcedureHost()` stops by itself after a time with no call.
 * The background host that `mark` starts after a cold command uses it (`MARK_AUTO_WARM`).
 *
 * - `run()` of `@mark1russell7/service` has no idle trigger. The host uses the stop request of the
 *   lifecycle, `life.shutdown()`, as an exit signal does. Thus the runner keeps the stop in stages
 *   and the exit, and this file has no signal handler, no listener and no `process.exit`.
 * - An interceptor of the host policy resets the timer at the start and at the end of each call.
 * - When the timer fires and a call is in flight (`life.inFlight()`), the host does not stop. An
 *   open stream or subscription is a call in flight until its last item (decision D4). The timer
 *   then reads the count again at each poll, and the full time starts again after the last call ends.
 * - The timer uses the clock of the run, so a test gives a fake clock.
 */

import { toMs, type Clock, type Duration, type Interceptor } from "@procedures/client";

/** The default time between two reads of the calls in flight while a call is open: 5 s. */
export const IDLE_POLL_MS = 5_000;

/** The option `idle` of `runProcedureHost()`. */
export interface HostIdle {
  /** The time with no call, after which the host stops. */
  readonly after: Duration;
  /** The time between two reads of the calls in flight while a call is open. The default is 5 s, or `after` when it is shorter. */
  readonly poll?: Duration | undefined;
}

/** The options of `idleTimer()`. */
export interface IdleTimerOptions {
  /** The time with no call, in milliseconds. */
  readonly afterMs: number;
  /** The time between two reads of the calls in flight while a call is open, in milliseconds. */
  readonly pollMs: number;
  readonly clock: Clock;
  /** This function gives the count of the calls in flight. */
  readonly inFlight: () => number;
  /** This function stops the host. The timer calls it one time, with the cause of the stop. */
  readonly stop: (cause: string) => void;
}

/** The timer of the idle stop. */
export interface IdleTimer {
  /** This method starts the timer. Before the start, `touch()` has no effect. */
  start(): void;
  /** This method tells the timer about a call: the full time starts again. */
  touch(): void;
  /** This method stops the timer for good. */
  cancel(): void;
}

/** This function gives the timer of an idle stop. */
export function idleTimer(options: IdleTimerOptions): IdleTimer {
  const { afterMs, pollMs, clock } = options;
  let started = false;
  let ended = false;
  // True when the last fire found a call in flight: the full time starts after that call ends
  let open = false;
  let cancelTimer: (() => void) | undefined;
  const arm = (delay: number): void => {
    cancelTimer?.();
    cancelTimer = clock.after(delay, fire);
  };
  const fire = (): void => {
    cancelTimer = undefined;
    if (ended) return;
    if (options.inFlight() > 0) {
      open = true;
      arm(pollMs);
      return;
    }
    if (open) {
      open = false;
      arm(afterMs);
      return;
    }
    ended = true;
    options.stop(`the host had no call for ${afterMs} ms`);
  };
  return {
    start() {
      if (started || ended) return;
      started = true;
      arm(afterMs);
    },
    touch() {
      if (!started || ended) return;
      open = false;
      arm(afterMs);
    },
    cancel() {
      ended = true;
      cancelTimer?.();
      cancelTimer = undefined;
    },
  };
}

/** The timer of the option `idle` of a host, in milliseconds. */
export function idleTimes(idle: HostIdle): { afterMs: number; pollMs: number } {
  const afterMs = toMs(idle.after, "idle.after");
  if (!Number.isFinite(afterMs) || afterMs <= 0) throw new RangeError(`idle.after must be more than 0 ms, got ${afterMs} ms`);
  const pollMs = idle.poll === undefined ? Math.min(IDLE_POLL_MS, afterMs) : toMs(idle.poll, "idle.poll");
  if (!Number.isFinite(pollMs) || pollMs <= 0) throw new RangeError(`idle.poll must be more than 0 ms, got ${pollMs} ms`);
  return { afterMs, pollMs };
}

/** This function gives the interceptor that tells a timer about each call: at its start and at its end. */
export function idleInterceptor(timer: Pick<IdleTimer, "touch">): Interceptor {
  return async (_invocation, next) => {
    timer.touch();
    try {
      return await next();
    } finally {
      timer.touch();
    }
  };
}
