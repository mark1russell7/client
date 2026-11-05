/**
 * The cases of the tenant load bench (roadmap CLI-95). A case is `<rate>-p<processes>`, with `-burst` at its
 * end when one tenant also sends a burst. The rate is the writes of one second over all active tenants. It
 * comes from the first guess of the scale ladder: an active tenant writes 0.2 times a second, and 10 % of
 * the tenants are active. So 20, 200 and 2,000 writes a second are the rungs of 1,000, 10,000 and 100,000 tenants.
 *
 * The arm `store` keeps all active tenants in one collection. The arm `control` puts the same tenants in
 * `CONTROL_COLLECTIONS` collections. A fail of both arms is a limit of the runner, not of the one collection.
 */

export const TENANT_CASES = ["20-p1", "20-p2", "20-p4", "200-p1", "200-p2", "200-p4", "2000-p1", "2000-p2", "20-p2-burst", "200-p2-burst"] as const;

/** The arms of the bench. */
export type TenantArm = "store" | "control";

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
  readonly active: number;
}

/** This function reads a case from its id. */
export function parseTenantCase(id: string): TenantCase {
  const match = /^(\d+)-p(\d+)(-burst)?$/.exec(id);
  if (!match) throw new RangeError(`the case ${id} is not <rate>-p<processes>[-burst]`);
  const rate = Number(match[1]);
  return { rate, processes: Number(match[2]), burst: match[3] !== undefined, active: Math.round(rate / WRITES_PER_TENANT) };
}

/**
 * This function gives the tenant of an arrival. In the burst, one arrival in `(rate + 10) / 10` goes to the tenant
 * `BURST_TENANT`, so that tenant gets about 10 writes in that second. Each other arrival goes to the tenants in turn,
 * and each process gets a turn at each tenant, so a tenant writes through each process.
 */
export function tenantOf(kase: TenantCase, index: number, plannedMs: number): number {
  if (kase.burst && plannedMs >= BURST_AT_MS && plannedMs < BURST_AT_MS + BURST_MS) {
    const every = Math.max(1, Math.round((kase.rate + BURST_WRITES) / BURST_WRITES));
    if (index % every === 0) return BURST_TENANT;
  }
  return Math.floor(index / kase.processes) % kase.active;
}

/** One line of the counts of a child. A time is in milliseconds, from the planned time of the write. */
export interface TenantCount {
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
  /** The write conflicts of the server in the load and the grace. */
  readonly writeConflicts: number;
  /** The transactions of the server in the load and the grace. An abort with a retry is a retry of the driver. */
  readonly transactionsStarted: number;
  readonly transactionsAborted: number;
}
