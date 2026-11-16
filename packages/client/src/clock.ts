/**
 * The clock of the core (roadmap R35). The retry, the circuit breaker and the WebSocket client
 * read the time and start their timers only through a clock. Thus a test gives a fake clock, and
 * the timing is exact and repeatable.
 *
 * The clock comes from `@mark1russell7/service/clock` (roadmap R37). The entry imports nothing
 * else, and it has 228 bytes of gzip. The `fakeClock` of `@mark1russell7/service/testing` fits here.
 * A `Cancel` of the platform also has `unref`. The circuit breaker uses it for its reset: a breaker
 * must not keep a process alive for its reset time (BUGS-2026-07 M4).
 */

import { platformClock, unrefClock, type Cancel, type Clock } from "@mark1russell7/service/clock";

export type { Cancel, Clock };

/**
 * `unrefClock(clock)` gives a clock whose timers do not keep a Node process alive. A timer that only
 * watches other work uses it, for example the heartbeat of a connection: the socket keeps the
 * process alive. With a fake clock, the timers work as before.
 */
export { unrefClock };

/**
 * The clock of the platform: `performance.now()` and `setTimeout`. Its timers keep a Node process
 * alive, as `setTimeout` does: a script that waits for a retry does not end during the wait. The
 * `realClock` of the service package does the same since its version 0.9.0.
 */
export const realClock: Clock = platformClock();
