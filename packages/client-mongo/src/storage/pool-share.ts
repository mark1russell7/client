import type { Db } from "mongodb";

/**
 * The largest share. A burst of change reads waits on the processors, not on the connections. On 4
 * cores with MongoDB on the same machine, 4 connections read as fast as 32. The slowest query of
 * another caller in the burst fell from 29.3 ms to 9.8 ms. Each new connection also costs the client.
 */
const MOST_AT_ONE_TIME = 4;

/**
 * This function gives the limit of operations of one kind at one time on a pool: one third of
 * the pool, from 1 to 4. Each operation uses one connection at a time. So the other
 * operations of the process find a free connection in a burst.
 */
export function poolShare(db: Db): number {
  // A fake database of a test has no client
  const pool = (db.client as Db["client"] | undefined)?.options.maxPoolSize;
  return pool ? Math.max(1, Math.min(MOST_AT_ONE_TIME, Math.floor(pool / 3))) : MOST_AT_ONE_TIME;
}
