/**
 * The server of the tenant bench in the load (roadmap CLI-96). These numbers tell a limit of the server from a limit of
 * the writers. They are the write tickets, the queue of writers and the lock waits. They are also the time of a write
 * inside the server and the eviction by the threads of the application.
 */

import { median } from "@mark1russell7/rigor-statistics";

/** One reading of the server in the load. A field is null where the server does not give it. */
export interface ServerSample {
  /** The time of the reading, in milliseconds from the start of the load. */
  readonly at: number;
  /** The write tickets in use. */
  readonly ticketsOut: number | null;
  /** The write tickets that are free. */
  readonly ticketsAvailable: number | null;
  /** The writers in the queue of the global lock. */
  readonly queuedWriters: number | null;
  /** The dirty data of the cache, in megabytes. */
  readonly dirtyMb: number | null;
}

/** The counters of the server that only grow. A field is null where the server does not give it. */
export interface ServerTotals {
  readonly globalLockWaitUs: number | null;
  readonly databaseLockWaitUs: number | null;
  readonly collectionLockWaitUs: number | null;
  readonly writeLatencyUs: number | null;
  readonly writeOps: number | null;
  readonly appEvictedPages: number | null;
  readonly appEvictionUs: number | null;
}

/** The server in the load. The fields of the samples are null when the arm took no samples. */
export interface ServerRead {
  /** The time that the writes waited for each lock, in milliseconds. */
  readonly lockWaitMs: { readonly global: number | null; readonly database: number | null; readonly collection: number | null };
  /** The mean time of a write inside the server, in milliseconds. */
  readonly serverWriteMs: number | null;
  /** The writes that the server did in the load. */
  readonly serverWrites: number | null;
  readonly appEvictedPages: number | null;
  /** The time that the threads of the application gave to eviction, in milliseconds. */
  readonly appEvictionMs: number | null;
  readonly ticketsOutMax: number | null;
  readonly ticketsAvailableMin: number | null;
  readonly queuedWritersMax: number | null;
  readonly queuedWritersMedian: number | null;
  readonly dirtyMbMax: number | null;
  /** The readings of each second. They are only in a run with `TENANT_SERVER_SAMPLES=1`. */
  readonly samples?: readonly ServerSample[];
}

/** This function gives the number at a path of a status document, or null where the document has none. */
export function statusNumber(status: unknown, path: readonly string[]): number | null {
  let value = status;
  for (const key of path) {
    if (value === null || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[key];
  }
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const sum = (values: readonly (number | null)[]): number | null => (values.every((value) => value === null) ? null : values.reduce<number>((all, value) => all + (value ?? 0), 0));
const round = (value: number | null, digits = 3): number | null => (value === null ? null : Number(value.toFixed(digits)));

/**
 * This function gives the time that writes waited for a lock of one kind: the exclusive and the intent modes.
 * MongoDB adds `timeAcquiringMicros` to a lock only after its first wait. So a lock with no such field gives 0, and only a missing lock gives `null`.
 */
const lockWait = (status: unknown, kind: string): number | null => {
  const waits = sum([statusNumber(status, ["locks", kind, "timeAcquiringMicros", "w"]), statusNumber(status, ["locks", kind, "timeAcquiringMicros", "W"])]);
  if (waits !== null) return waits;
  const locks = (status as { locks?: Record<string, unknown> } | null)?.locks;
  return typeof locks?.[kind] === "object" && locks[kind] !== null ? 0 : null;
};

/** This function gives one sample from a `serverStatus` document. MongoDB 7 gives the tickets in `queues.execution`. */
export function sampleOf(status: unknown, at: number): ServerSample {
  const tickets = statusNumber(status, ["queues", "execution", "write", "out"]) === null ? ["wiredTiger", "concurrentTransactions", "write"] : ["queues", "execution", "write"];
  const dirty = statusNumber(status, ["wiredTiger", "cache", "tracked dirty bytes in the cache"]);
  return {
    at: Math.round(at),
    ticketsOut: statusNumber(status, [...tickets, "out"]),
    ticketsAvailable: statusNumber(status, [...tickets, "available"]),
    queuedWriters: statusNumber(status, ["globalLock", "currentQueue", "writers"]),
    dirtyMb: round(dirty === null ? null : dirty / 1e6, 1),
  };
}

/** This function gives the counters that grow from a `serverStatus` document. */
export function totalsOf(status: unknown): ServerTotals {
  return {
    globalLockWaitUs: lockWait(status, "Global"),
    databaseLockWaitUs: lockWait(status, "Database"),
    collectionLockWaitUs: lockWait(status, "Collection"),
    writeLatencyUs: statusNumber(status, ["opLatencies", "writes", "latency"]),
    writeOps: statusNumber(status, ["opLatencies", "writes", "ops"]),
    appEvictedPages: statusNumber(status, ["wiredTiger", "cache", "pages evicted by application threads"]),
    appEvictionUs: statusNumber(status, ["wiredTiger", "cache", "application thread time evicting (usecs)"]),
  };
}

/** This function gives the server in the load from the counters at its start and its end, and the samples between them. */
export function serverRead(from: ServerTotals, to: ServerTotals, samples?: readonly ServerSample[]): ServerRead {
  const grew = (pick: (totals: ServerTotals) => number | null): number | null => {
    const start = pick(from);
    const end = pick(to);
    return start === null || end === null ? null : end - start;
  };
  const ms = (us: number | null): number | null => round(us === null ? null : us / 1000);
  const own = (pick: (sample: ServerSample) => number | null): number[] => (samples ?? []).map(pick).filter((value): value is number => value !== null);
  const most = (values: readonly number[]): number | null => (values.length === 0 ? null : Math.max(...values));
  const least = (values: readonly number[]): number | null => (values.length === 0 ? null : Math.min(...values));
  const writes = grew((totals) => totals.writeOps);
  const latency = grew((totals) => totals.writeLatencyUs);
  return {
    lockWaitMs: { global: ms(grew((totals) => totals.globalLockWaitUs)), database: ms(grew((totals) => totals.databaseLockWaitUs)), collection: ms(grew((totals) => totals.collectionLockWaitUs)) },
    serverWriteMs: writes === null || latency === null || writes === 0 ? null : round(latency / writes / 1000),
    serverWrites: writes,
    appEvictedPages: grew((totals) => totals.appEvictedPages),
    appEvictionMs: ms(grew((totals) => totals.appEvictionUs)),
    ticketsOutMax: most(own((sample) => sample.ticketsOut)),
    ticketsAvailableMin: least(own((sample) => sample.ticketsAvailable)),
    queuedWritersMax: most(own((sample) => sample.queuedWriters)),
    queuedWritersMedian: own((sample) => sample.queuedWriters).length === 0 ? null : median(own((sample) => sample.queuedWriters)),
    dirtyMbMax: most(own((sample) => sample.dirtyMb)),
    ...(samples === undefined ? {} : { samples }),
  };
}
