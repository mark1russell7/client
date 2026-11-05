import type { Db } from "mongodb";

/** The largest share: approximately one third of the default pool of the driver (100). */
const MOST_AT_ONE_TIME = 32;

/**
 * This function gives the limit of operations of one kind at one time on a pool: one third of
 * the pool, from 1 to 32. Each operation uses one connection at a time. So the other
 * operations of the process find a free connection in a burst.
 */
export function poolShare(db: Db): number {
  // A fake database of a test has no client
  const pool = (db.client as Db["client"] | undefined)?.options.maxPoolSize;
  return pool ? Math.max(1, Math.min(MOST_AT_ONE_TIME, Math.floor(pool / 3))) : MOST_AT_ONE_TIME;
}
