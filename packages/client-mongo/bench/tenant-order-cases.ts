/**
 * The values of the suite `tenant-order` (roadmap CLI-96). The queue of the store starts the writes of one process in arrival order. A form with no queue can lose that order.
 */

/** The ids of one pass. */
export const ORDER_IDS = 100;

/** The writes of one id in one pass. */
export const ORDER_WRITES = 4;

/** The most time of a hold in a write, as in the test of the rule. */
export const ORDER_HOLD_MS = 20;

/** The copies of the store. The copy `today` has the queue, so it must hold the order. */
export const ORDER_COPIES = ["today", "formb", "formbbound", "formbbound8", "formbboundid"] as const;

/** The ids of one held pass. */
export const ORDER_HELD_IDS = 20;

/**
 * The most time that the held pass holds the first write of an id. A copy with an order rule keeps the second write behind the first, so only this time ends the hold.
 * The time is well under the lease of a write, so no write moves to a new number.
 */
export const ORDER_HELD_MS = 200;

/** The result of one pass over the ids. */
export interface OrderPass {
  readonly wrong: number;
  readonly absent: number;
  readonly examples: readonly string[];
}

/** The result of one round of one copy. */
export interface OrderRound {
  readonly copy: string;
  readonly round: number;
  readonly newIds: OrderPass;
  readonly existingIds: OrderPass;
  /** Two writes of one id, on new ids. The first write stops before its write of the items until the second write ends. */
  readonly heldNew: OrderPass;
  /** The same hold, on existing ids. */
  readonly heldExisting: OrderPass;
  readonly errors: Readonly<Record<string, string>>;
  readonly counts: Readonly<Record<string, number>>;
}
