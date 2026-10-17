/**
 * A clock of the platform that counts its timers. The leak tests (roadmap R30) and the soak test
 * (roadmap R32) give it to a transport. At the end, no timer is live: each timer came due, or its
 * owner stopped it.
 */

import { realClock, type Clock } from "../src/clock.js";

/** A clock with the counts of its timers. */
export interface CountingClock extends Clock {
  /** The number of timers that are not stopped and not called. */
  readonly live: number;
  /** The number of timers that the clock started. */
  readonly started: number;
}

/** This function makes a counting clock on the clock of the platform. */
export function countingClock(): CountingClock {
  let live = 0;
  let started = 0;
  return {
    now: () => realClock.now(),
    after(time, run) {
      live++;
      started++;
      let open = true;
      const close = (): void => {
        if (open) live--;
        open = false;
      };
      const cancel = realClock.after(time, () => {
        close();
        run();
      });
      return Object.assign(
        () => {
          close();
          cancel();
        },
        { unref: cancel.unref },
      );
    },
    get live() {
      return live;
    },
    get started() {
      return started;
    },
  };
}
