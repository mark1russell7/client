/**
 * The clock of the core (roadmap R35). The retry, the circuit breaker and the WebSocket client
 * read the time and start their timers only through a clock. Thus a test gives a fake clock, and
 * the timing is exact and repeatable.
 *
 * The interface has the shape of the `Clock` of `@mark1russell7/service`: a clock of that package
 * fits here, also its `fakeClock` of `@mark1russell7/service/testing`.
 */

/** This function stops a timer that `Clock.after` started. A second call does nothing. */
export type Cancel = (() => void) & {
  /**
   * The timer does not keep a Node process alive. The circuit breaker uses it for its reset: a
   * breaker must not keep a process alive for its reset time (BUGS-2026-07 M4).
   */
  unref?: () => void;
};

/** A monotonic clock, and timers on it. */
export interface Clock {
  /** This method gives the monotonic time, in milliseconds. A step of the wall clock does not move it. */
  now(): number;
  /** This method starts `run` after `ms` milliseconds, and gives the function that stops it. */
  after(ms: number, run: () => void): Cancel;
}

/**
 * The clock of the platform: `performance.now()` and `setTimeout`. Its timers keep a Node process
 * alive, as `setTimeout` does: a script that waits for a retry does not end during the wait.
 */
export const realClock: Clock = {
  now: () => {
    const performance = (globalThis as { performance?: { now(): number } }).performance;
    return performance ? performance.now() : Date.now();
  },
  after(ms, run) {
    const timer = setTimeout(run, Math.max(0, ms));
    const cancel: Cancel = () => clearTimeout(timer);
    cancel.unref = () => (timer as { unref?: () => void }).unref?.();
    return cancel;
  },
};
