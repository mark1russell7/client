import type { Db } from "mongodb";

/** The pool size of the driver when the client does not tell its size (the default of `maxPoolSize`). */
export const DEFAULT_POOL_SIZE = 100;

/**
 * The part of the pool for the change reads of one client: one twelfth, so 8 reads at the default pool.
 * A burst of change reads waits on round trips over a network. So a share of the pool, not a fixed count, sets the limit.
 *
 * The objective: in a burst, the p95 of other queries of the pool stays within 1.5 round trips.
 * The share of the pool controls that p95 only when the connections wait on the network.
 * So the suite `read-bound` of `stream-cost.yml` gates the objective at a delay of 20 ms.
 * There, 8 reads at one time gave 1.01 to 1.44 round trips (run 42105731536). 16 reads gave up to 1.86, and 4 reads gave a burst twice as long.
 *
 * At a short round trip, the work of the server sets the p95 of each client of the server.
 * A limit for one pool only spreads that work. At 5 ms, 8 reads gave up to 3 round trips, and 4 reads gave 2.2 (run 42041953313).
 * There the suite only reports, with the p95 over the quiet p95 of the same probe.
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
