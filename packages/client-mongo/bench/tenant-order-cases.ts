/**
 * The values of the suite `tenant-order` (roadmap CLI-96). The queue of the store runs the writes of one process in arrival order. A form with no queue can lose that order.
 */

/** The ids of one pass. */
export const ORDER_IDS = 100;

/** The writes of one id in one pass. */
export const ORDER_WRITES = 4;

/** The most time of a hold in a write, as in the test of the rule. */
export const ORDER_HOLD_MS = 20;

/** The copies of the store. The copy `today` has the queue, so it must hold the order. */
export const ORDER_COPIES = ["today", "formb", "formbbound", "formbbound8"] as const;

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
  readonly errors: Readonly<Record<string, string>>;
  readonly counts: Readonly<Record<string, number>>;
}
