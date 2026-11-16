/**
 * The age of the resume token of a change watcher (roadmap CLI-110). A token moves when its cluster time is later
 * than the cluster time of the token before it. The same token again, or a new token at the same cluster time,
 * does not move it. A user reads a stalled feed from the age, without a sampler of its own.
 *
 * The package does not export this module. `watchDatabaseChanges()` and `watchStorageChanges()` give the age as
 * `tokenAgeMs` on their handles.
 */

import type { Clock } from "@procedures/client";

/** The type byte of a timestamp at the start of the key of a resume token of the server. */
const TIMESTAMP_TYPE = "82";

/**
 * This function gives the cluster time of a resume token as 16 hex digits, or undefined for a token of another form.
 * The key of a token of the server starts with the type byte `82` and the 8 bytes of the timestamp, high byte first.
 * So the order of two of these texts is the order of their cluster times.
 */
export function clusterTimeOfToken(token: unknown): string | undefined {
  const data = typeof token === "object" && token !== null ? (token as { _data?: unknown })._data : undefined;
  if (typeof data !== "string" || !data.startsWith(TIMESTAMP_TYPE) || !/^[0-9a-f]{16}$/i.test(data.slice(2, 18))) return undefined;
  return data.slice(2, 18).toLowerCase();
}

/** This function tells if `next` is later than `before`. A token without a cluster time moves when it is a different token. */
function moves(next: unknown, before: unknown): boolean {
  if (next === undefined || next === null) return false;
  if (before === undefined || before === null) return true;
  const nextTime = clusterTimeOfToken(next);
  const beforeTime = clusterTimeOfToken(before);
  if (nextTime !== undefined && beforeTime !== undefined) return nextTime > beforeTime;
  return JSON.stringify(next) !== JSON.stringify(before);
}

/** The age of the token of one watcher. */
export interface TokenAge {
  /** This method notes a token of the watcher. It moves the age to 0 when the token is later than the last token that moved it. */
  note(token: unknown): void;
  /** This method gives the milliseconds of the clock since the token last moved, or since the start before the first move. */
  ageMs(): number;
}

/**
 * This function starts the age of the token of one watcher at the time of the clock.
 *
 * @param clock - The clock of the watcher
 * @param start - The start token of the watcher, or undefined. A later token moves the age.
 */
export function tokenAge(clock: Clock, start?: unknown): TokenAge {
  let last: unknown = start;
  let movedAt = clock.now();
  return {
    note(token: unknown): void {
      if (!moves(token, last)) return;
      last = token;
      movedAt = clock.now();
    },
    ageMs(): number {
      return clock.now() - movedAt;
    },
  };
}
