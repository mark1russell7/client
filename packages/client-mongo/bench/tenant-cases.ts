/**
 * The cases of the tenant load bench (roadmap CLI-95). A case is `<rate>-p<processes>`, with `-burst` at its
 * end when one tenant also sends a burst. The rate is the writes of one second over all active tenants. It
 * comes from the first guess of the scale ladder: an active tenant writes 0.2 times a second, and 10 % of
 * the tenants are active. So 20, 200 and 2,000 writes a second are the rungs of 1,000, 10,000 and 100,000 tenants.
 *
 * The arm `store` keeps all active tenants in one collection. The arm `control` puts the same tenants in
 * `CONTROL_COLLECTIONS` collections. A fail of both arms is a limit of the runner, not of the one collection.
 *
 * The suite `tenant-ceiling` asks which of the two limits the ceiling of the one collection is. Its rates are
 * between the rungs. A case with `-apart` at its end keeps MongoDB and the writers on their own processors.
 *
 * The suite `tenant-separate` asks which part of the one collection stops it. Its arms are the store with its queue off,
 * with many counters, and with both. A case with `-tmpfs` at its end uses a MongoDB with its files in memory, so no disk is in the path.
 *
 * The suite `tenant-first` adds the first loads of new tenants to the steady load. A case with `-first<n>` has n first loads in one second.
 *
 * The suite `tenant-forms` offers more until a form of the numbers stops keeping up. Its arm `control` tells a limit of the runner.
 * A case with `-hot` at its end sends all writes to one tenant, through each process. So the queue of that tenant and its counter stay in the path.
 */

export const TENANT_CASES = ["20-p1", "20-p2", "20-p4", "200-p1", "200-p2", "200-p4", "2000-p1", "2000-p2", "20-p2-burst", "200-p2-burst"] as const;

/** The cases of the suite `tenant-ceiling`: each rate with MongoDB and the writers on all processors, and apart. */
export const CEILING_CASES = ["400-p2", "800-p2", "1200-p2", "400-p2-apart", "800-p2-apart", "1200-p2-apart"] as const;

/** The cases of the suite `tenant-separate`. The rate is over the ceiling of the store, and the control of the suite `tenant-ceiling` holds it. */
export const SEPARATE_CASES = ["800-p1", "800-p2", "800-p1-tmpfs", "800-p2-tmpfs"] as const;

/** The arms of the suite `tenant-separate` that change a copy of the store. */
export const SEPARATE_ARMS = ["noqueue", "many", "neither"] as const;

/** The cases of the suite `tenant-first`: the steady load of two rungs, with 1, 5 and 10 first loads in one second. */
export const FIRST_LOAD_CASES = ["20-p2-first1", "20-p2-first10", "200-p2-first1", "200-p2-first5", "200-p2-first10"] as const;

/** The processors of MongoDB in a case with `-apart`. */
export const MONGO_CORES = "0,1";

/** The processors of the writers in a case with `-apart`. */
export const WRITER_CORES = "2,3";

/** The processors of MongoDB in a case without `-apart`. */
export const ALL_CORES = "0-3";

/** The cases of the suite `tenant-forms`: rates over the ceiling of the store, and one tenant through two processes. */
export const FORM_CASES = ["800-p2", "1200-p4", "1600-p4", "200-p2-hot", "400-p2-hot"] as const;

/** The arms of the suite `tenant-forms` that use a copy of the store. */
export const FORM_ARMS = ["forma", "formb"] as const;

/** The arm of the suite `tenant-bound` that the suite `tenant-forms` does not have: form B with a bound on the calls in progress. */
export const BOUND_ARMS = ["formbbound", "formbbound8", "formbbound32"] as const;

/** The cases of the suite `tenant-bound`: the rates where form B collapses, the hot tenant where it holds, and the burst of first loads. */
export const BOUND_CASES = ["800-p2", "1200-p4", "200-p2-hot", "400-p2-hot", "200-p2-first10"] as const;

/** The cases of the suite `tenant-bound-size`. A small bound can hold writes back at the first rate. The second rate is over the limit of the machine. The third case is the hot tenant. */
export const BOUND_SIZE_CASES = ["800-p2", "1200-p4", "400-p2-hot"] as const;

/** The arms that use a copy of the store. */
export const COPY_ARMS: readonly string[] = [...SEPARATE_ARMS, ...FORM_ARMS, ...BOUND_ARMS];

/** The arms of the bench. */
export type TenantArm = "store" | "control" | (typeof SEPARATE_ARMS)[number] | (typeof FORM_ARMS)[number] | (typeof BOUND_ARMS)[number];

/** The arms of the bench, in the order of a report. */
export const TENANT_ARMS: readonly TenantArm[] = ["store", "control", ...SEPARATE_ARMS, ...FORM_ARMS, ...BOUND_ARMS];

/** The writes of an active tenant in one second: the first guess of the scale ladder. */
export const WRITES_PER_TENANT = 0.2;

/** The time of the load of a child. */
export const WINDOW_MS = 20_000;

/** The time after the load in which a write can still end. A write that ends later has no reply in the record. */
export const GRACE_MS = 30_000;

/** The size of the text of one write. */
export const TENANT_BYTES = 1_000;

/** The collections of the arm `control`. */
export const CONTROL_COLLECTIONS = 100;

/** The start of the burst of the tenant `BURST_TENANT`, and its length: 10 writes in one second. */
export const BURST_AT_MS = 5_000;
export const BURST_MS = 1_000;
export const BURST_WRITES = 10;
export const BURST_TENANT = 0;

/**
 * The writes of one first load in its peak second. One measured first load of an app has 82 writes in 28 s.
 * Its peak second has 60 writes at a cache of 512 MiB and 72 at a cache of 2,048 MiB. This bench takes the larger peak.
 */
export const FIRST_LOAD_WRITES = 72;

/**
 * The writes of each collection in that measured first load: 82 writes over 11 collections. The last entry is the
 * collection of the steady load, because the collection with the most steady writes had 2 of the 82.
 */
export const FIRST_LOAD_SPLIT = [23, 17, 10, 9, 5, 5, 4, 3, 2, 2, 2] as const;

/** The collection of each write of a first load, in turn. Each collection comes evenly, as often as its share. */
export const FIRST_LOAD_ORDER: readonly number[] = (() => {
  const total = FIRST_LOAD_SPLIT.reduce((sum: number, weight) => sum + weight, 0);
  const credit: number[] = FIRST_LOAD_SPLIT.map(() => 0);
  return Array.from({ length: total }, () => {
    FIRST_LOAD_SPLIT.forEach((weight, collection) => (credit[collection]! += weight));
    const next = credit.indexOf(Math.max(...credit));
    credit[next]! -= total;
    return next;
  });
})();

/** The server code of a write conflict. */
export const WRITE_CONFLICT = 112;

/** The most time between the plan and the send. A later send means that the run measured its driver. */
export const DRIVER_LIMIT_MS = 100;

/** The largest p99 of a write, from its planned time, of a provisional pass. It is a first reading, not a limit from runs. */
export const KEEP_UP_P99_MS = 1_000;

/** The smallest share of the planned rate that a provisional pass needs. */
export const KEEP_UP_SHARE = 0.95;

/** One case, read from its id. */
export interface TenantCase {
  readonly rate: number;
  readonly processes: number;
  readonly burst: boolean;
  readonly apart: boolean;
  readonly tmpfs: boolean;
  readonly active: number;
  /** The first loads in the second of the burst. */
  readonly firstLoads: number;
  /** All writes go to one tenant. */
  readonly hot: boolean;
}

/** This function reads a case from its id. */
export function parseTenantCase(id: string): TenantCase {
  const match = /^(\d+)-p(\d+)(-burst)?(?:-first(\d+))?(-apart)?(-tmpfs)?(-hot)?$/.exec(id);
  if (!match) throw new RangeError(`the case ${id} is not <rate>-p<processes>[-burst][-first<n>][-apart][-tmpfs][-hot]`);
  const rate = Number(match[1]);
  return { rate, processes: Number(match[2]), burst: match[3] !== undefined, firstLoads: Number(match[4] ?? 0), apart: match[5] !== undefined, tmpfs: match[6] !== undefined, hot: match[7] !== undefined, active: match[7] !== undefined ? 1 : Math.round(rate / WRITES_PER_TENANT) };
}

/**
 * This function gives the tenant of an arrival. In the burst, one arrival in `(rate + 10) / 10` goes to the tenant
 * `BURST_TENANT`, so that tenant gets approximately 10 writes in that second. Each other arrival goes to the tenants in turn,
 * and each process gets a turn at each tenant, so a tenant writes through each process.
 */
export function tenantOf(kase: TenantCase, index: number, plannedMs: number): number {
  if (kase.burst && plannedMs >= BURST_AT_MS && plannedMs < BURST_AT_MS + BURST_MS) {
    const every = Math.max(1, Math.round((kase.rate + BURST_WRITES) / BURST_WRITES));
    if (index % every === 0) return BURST_TENANT;
  }
  return Math.floor(index / kase.processes) % kase.active;
}

/** One write of a first load: its load and its entry of `FIRST_LOAD_SPLIT`. */
export interface FirstLoadWrite {
  readonly load: number;
  readonly collection: number;
}

/**
 * This function gives the first load of an arrival, or null for a write of the steady load. In the second of the
 * burst, `FIRST_LOAD_WRITES` writes of each first load join the steady rate. So the same share of the arrivals goes to the first loads.
 */
export function firstLoadOf(kase: TenantCase, index: number, plannedMs: number): FirstLoadWrite | null {
  if (kase.firstLoads === 0 || plannedMs < BURST_AT_MS || plannedMs >= BURST_AT_MS + BURST_MS) return null;
  const writes = kase.firstLoads * FIRST_LOAD_WRITES;
  const share = writes / (kase.rate + writes);
  const turn = Math.floor(index * share);
  if (Math.floor((index + 1) * share) === turn) return null;
  return { load: turn % kase.firstLoads, collection: FIRST_LOAD_ORDER[Math.floor(turn / kase.firstLoads) % FIRST_LOAD_ORDER.length]! };
}

/** This function gives the name of a collection of a first load. The last entry of the split is the collection of the steady load of the arm. */
export function firstLoadCollection(arm: TenantArm, write: FirstLoadWrite): string {
  if (write.collection < FIRST_LOAD_SPLIT.length - 1) return `load${write.collection}`;
  return arm === "control" ? `docs${write.load % CONTROL_COLLECTIONS}` : "docs";
}

/** The share of the time of one processor in the load. */
export interface CoreShare {
  readonly core: number;
  /** The share of the time with work, without the wait for the disk. */
  readonly busy: number;
  /** The share of the time in a wait for the disk. */
  readonly iowait: number;
}

/** The disk with the most writes in the load. */
export interface DiskRead {
  readonly device: string;
  readonly writesPerSecond: number;
  readonly mbPerSecond: number;
  /** The mean time of a write of the device. */
  readonly msPerWrite: number;
  /** The share of the load in which the device had work. */
  readonly busy: number;
}

/** The journal of MongoDB in the load. */
export interface JournalRead {
  readonly syncsPerSecond: number;
  readonly msPerSync: number;
}

/** One line of the counts of a child. A time is in milliseconds, from the planned time of the write. */
export interface TenantCount {
  /** The largest list of numbers in progress that one sample of the counter documents reads. */
  readonly pendingPeak?: number;
  /** The size in bytes of the largest counter document that one sample reads. */
  readonly counterBytesPeak?: number;
  /** The write conflicts that the server retries by itself, from its own counter. A conflict in a transaction is not in this count. */
  readonly serverWriteConflicts?: number;
  readonly job: string;
  readonly arm: TenantArm;
  readonly case: string;
  readonly planned: number;
  readonly unsent: number;
  readonly unfinished: number;
  readonly failures: number;
  /** The writes that ended inside the load, for each second of the load. */
  readonly writesPerSecond: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  /** The p99 of the tenants other than the tenant of the burst. It equals `p99Ms` in a case with no burst. */
  readonly othersP99Ms: number;
  /** The median in the last quarter of the load over the median in its first quarter. A value far above 1 is a queue that grows. */
  readonly drift: number;
  readonly driverHeld: boolean;
  readonly driverWorstMs: number | null;
  /** The replies with a write conflict that the writers got in the load and the grace. A conflict in a transaction starts a retry. */
  readonly writeConflicts: number;
  /** The transactions of the server in the load and the grace. An abort that the driver retries is one more start. */
  readonly transactionsStarted: number;
  readonly transactionsAborted: number;
  /** The processors of the machine in the load. The value is null where the machine has no `/proc/stat`. */
  readonly cores: readonly CoreShare[] | null;
  /** The disk in the load. The value is null where the machine has no `/proc/diskstats`. A record from before this field has none. */
  readonly disk?: DiskRead | null;
  /** The journal in the load. The value is null where the server does not give it. A record from before this field has none. */
  readonly journal?: JournalRead | null;
  /** The share of one processor that each writer used in the load. A value near 1 means that the writer is the limit. */
  readonly writerBusy?: readonly number[];
  /** One message of each kind of failure, with its count. */
  readonly errors?: Readonly<Record<string, number>>;
  /** The writes of the first loads in the case. */
  readonly firstLoadWrites?: number;
  /** The time from the start of the burst to the last reply of the slowest first load. A write with no reply counts at the end of the grace. */
  readonly firstLoadMs?: number;
  /** The p99 of the writes of the first loads, from their planned times. */
  readonly firstLoadP99Ms?: number;
}
