/**
 * The re-check of the admission of the open subscriptions (roadmap CLI-44).
 *
 * At the start of a subscription, a publisher examines the rights of the subscriber. It examines
 * the topic rule, the reads of the capability, `allow` and the partition. A right can change
 * later, for example when the app removes a user from a group. Thus the publisher examines each
 * open subscription again:
 *
 * - At a change of the rights. The host uses `rightsChanged()` of the publisher, or the source of
 *   the option `recheck.rightsChanges` gives the change to its listener.
 * - After the time `recheck.maxAge` on the clock of the publisher, from the last check.
 *
 * The check is the same function as at the start. While it operates, the events of the
 * subscription wait. A refusal ends the subscription with its error, for example `FORBIDDEN`, and
 * the events that wait go. Without a call of `rightsChanged()` and without the option, nothing
 * changes.
 */

import type { Cancel, Clock } from "../clock.js";
import { toMs, type Duration } from "../duration.js";
import type { Principal } from "../server/types.js";

/**
 * The subscriptions that a change of the rights touches: the id of a principal, or a test of the
 * principal of a subscription. A subscription without a principal (a call from this process) has
 * no id, so only a test or a change of each subscription touches it.
 */
export type RightsChange = string | ((principal: Principal | undefined) => boolean);

/** The options of the re-check of the open subscriptions of a publisher (roadmap CLI-44). */
export interface SubscriptionRecheck {
  /**
   * The longest time from one check of a subscription to the next check, for example `minutes(1)`.
   * The time is on the clock of the publisher. Without it, only a change of the rights starts a
   * check.
   */
  readonly maxAge?: Duration | undefined;
  /**
   * The source of the changes of the rights of the app. While the publisher has an open
   * subscription, the source has one listener of the publisher. The source gives the function that
   * removes the listener. Each call of the listener is a call of `rightsChanged()`: without a
   * change, each subscription gets a check.
   */
  readonly rightsChanges?: ((listener: (change?: RightsChange) => void) => () => void) | undefined;
}

/** The cause of a re-check: a change of the rights, or the max age. */
export type RecheckCause = "rights" | "age";

/** A subscription that the re-checks can hold and watch. */
export interface RecheckedSubscription {
  /**
   * This function holds the events of the subscription until the check ends. A refusal ends the
   * subscription with its error. The promise ends with the check, and it does not reject.
   */
  hold(check: Promise<void>): Promise<void>;
  /** This function runs the listener when the subscription ends. */
  onEnd(listener: () => void): void;
}

/** One subscription that the re-checks watch. */
interface Watch {
  readonly principal: Principal | undefined;
  /** The timer of the max age, or undefined. */
  timer: Cancel | undefined;
  /** This function starts a check at once. The promise ends when the check ends. */
  readonly recheck: (cause: RecheckCause) => Promise<void>;
}

/** True when the change touches a subscription of the principal. A test that throws touches it. */
function touches(change: RightsChange | undefined, principal: Principal | undefined): boolean {
  if (change === undefined) return true;
  if (typeof change === "string") return principal?.id === change;
  try {
    return change(principal);
  } catch {
    return true;
  }
}

/** The promise of a check. A check that throws at once gives a rejected promise. */
function started(check: (cause: RecheckCause) => Promise<void>, cause: RecheckCause): Promise<void> {
  return new Promise<void>((resolve) => resolve(check(cause)));
}

/**
 * The re-checks of the open subscriptions of one publisher (roadmap CLI-44). The publisher gives
 * each new subscription to `watch()`, with the check of its admission.
 */
export class SubscriptionRechecks {
  private readonly watches = new Set<Watch>();
  private readonly maxAgeMs: number | undefined;
  private readonly source: SubscriptionRecheck["rightsChanges"];
  /** The function that removes the listener of the source, while a subscription is open */
  private stopListening: (() => void) | undefined;

  constructor(
    options: SubscriptionRecheck,
    private readonly clock: Clock,
  ) {
    const maxAgeMs = options.maxAge === undefined ? undefined : toMs(options.maxAge, "recheck.maxAge");
    if (maxAgeMs !== undefined && !(maxAgeMs > 0)) {
      throw new TypeError(`recheck.maxAge must be more than 0 ms, got ${maxAgeMs} ms`);
    }
    this.maxAgeMs = maxAgeMs;
    this.source = options.rightsChanges;
  }

  /** The number of the subscriptions that the re-checks watch. */
  get size(): number {
    return this.watches.size;
  }

  /**
   * This function watches a subscription until it ends. A change of the rights of its principal
   * and its max age start the check. The check gets the cause, and it must throw the refusal.
   */
  watch(subscription: RecheckedSubscription, principal: Principal | undefined, check: (cause: RecheckCause) => Promise<void>): void {
    const watch: Watch = {
      principal,
      timer: undefined,
      recheck: (cause) => {
        this.stopTimer(watch);
        return subscription.hold(started(check, cause)).then(() => {
          // A check that passes gives the admission a new age
          if (this.watches.has(watch)) this.startTimer(watch);
        });
      },
    };
    this.watches.add(watch);
    subscription.onEnd(() => this.unwatch(watch));
    if (!this.watches.has(watch)) return;
    this.startTimer(watch);
    if (this.source && !this.stopListening) {
      try {
        this.stopListening = this.source((change) => void this.rightsChanged(change));
      } catch (error) {
        // A source that cannot listen cannot tell a revocation: the subscription ends
        void subscription.hold(Promise.reject(error));
      }
    }
  }

  /**
   * This function starts a check of each watched subscription that the change touches. The
   * promise ends when each check ends.
   */
  rightsChanged(change?: RightsChange): Promise<void> {
    const checks: Array<Promise<void>> = [];
    for (const watch of [...this.watches]) {
      if (touches(change, watch.principal)) checks.push(watch.recheck("rights"));
    }
    return Promise.all(checks).then(() => undefined);
  }

  /** This function stops the watch of a subscription that ended. */
  private unwatch(watch: Watch): void {
    this.stopTimer(watch);
    if (!this.watches.delete(watch) || this.watches.size > 0) return;
    // The last subscription ended: the publisher does not listen to the source
    const stop = this.stopListening;
    this.stopListening = undefined;
    stop?.();
  }

  /** This function starts the timer of the max age of a subscription. */
  private startTimer(watch: Watch): void {
    if (this.maxAgeMs === undefined) return;
    this.stopTimer(watch);
    const timer = this.clock.after(this.maxAgeMs, () => {
      if (watch.timer === timer) watch.timer = undefined;
      void watch.recheck("age");
    });
    // A check does not keep a Node process alive
    timer.unref?.();
    watch.timer = timer;
  }

  /** This function stops the timer of the max age of a subscription. */
  private stopTimer(watch: Watch): void {
    const timer = watch.timer;
    watch.timer = undefined;
    timer?.();
  }
}
