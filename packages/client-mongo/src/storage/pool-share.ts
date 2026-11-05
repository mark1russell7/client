import type { Db } from "mongodb";

/** The pool size of the driver when the client does not tell its size (the default of `maxPoolSize`). */
export const DEFAULT_POOL_SIZE = 100;

/**
 * The part of the pool for the change reads of one client: one twelfth, so 8 reads at the default pool.
 * A burst of change reads waits on round trips over a network. So a share of the pool, not a fixed count, sets the limit.
 *
 * The objective: other queries of the pool keep their time in a burst. The suite `read-bound` of `stream-cost.yml` examines it.
 * At a round trip of 20 ms, 8 reads at one time gave a p95 of 21 to 30 ms to the other queries (run 42105731536).
 * 4 reads gave 21 ms and a burst twice as long. 32 reads gave 60 to 106 ms.
 * At a round trip of 5 ms, 8 reads gave up to 17 ms, or 3 round trips, and 4 reads gave up to 12.5 ms (run 42041953313).
 * At that delay, the processors set the time, not the connections.
 */
export const CHANGE_READ_DIVISOR = 12;

/**
 * This function gives the limit of operations of one kind at one time on a pool: the pool size over `divisor`,
 * from 1 to `most`. Each operation uses one connection at a time. So the other operations of the process find a free
 * connection in a burst, and a larger pool gives a larger limit.
 */
export function poolShare(db: Db, divisor: number, most: number = Number.POSITIVE_INFINITY): number {
  // A fake database of a test has no client. A pool size of 0 has no limit in the driver: the share then uses the default size
  const pool = (db.client as Db["client"] | undefined)?.options.maxPoolSize || DEFAULT_POOL_SIZE;
  return Math.max(1, Math.min(most, Math.floor(pool / divisor)));
}
