import { describe, expect, it } from "vitest";
import { SUITE_CASES, PARTITION_CASES } from "./tenant-cases.js";
import { sampleOf, serverRead, statusNumber, totalsOf } from "./tenant-server.js";

/** This function gives a `serverStatus` document of MongoDB 7 with the stated counters. */
function status(at: { lockUs: number; latencyUs: number; ops: number; out: number; available: number; queued: number; dirtyBytes: number; evictUs: number }): object {
  return {
    locks: { Collection: { timeAcquiringMicros: { w: at.lockUs, W: 0 } }, Global: { timeAcquiringMicros: { w: 10 } } },
    opLatencies: { writes: { latency: at.latencyUs, ops: at.ops } },
    queues: { execution: { write: { out: at.out, available: at.available } } },
    globalLock: { currentQueue: { writers: at.queued } },
    wiredTiger: { cache: { "tracked dirty bytes in the cache": at.dirtyBytes, "application thread time evicting (usecs)": at.evictUs } },
  };
}

describe("the server readings of the tenant bench", () => {
  it("gives the growth of the counters in the load and the mean time of a write inside the server", () => {
    const from = totalsOf(status({ lockUs: 1_000, latencyUs: 2_000_000, ops: 1_000, out: 0, available: 128, queued: 0, dirtyBytes: 0, evictUs: 0 }));
    const to = totalsOf(status({ lockUs: 51_000, latencyUs: 6_000_000, ops: 3_000, out: 0, available: 128, queued: 0, dirtyBytes: 0, evictUs: 7_000 }));
    const read = serverRead(from, to);
    expect(read.lockWaitMs).toEqual({ global: 0, database: null, collection: 50 });
    expect(read.serverWrites).toBe(2_000);
    expect(read.serverWriteMs).toBe(2);
    expect(read.appEvictionMs).toBe(7);
    expect(read.appEvictedPages).toBeNull();
    expect(read.queuedWritersMax).toBeNull();
    expect("samples" in read).toBe(false);
  });

  it("gives the worst of the samples: the most writers in the queue and the fewest free tickets", () => {
    const totals = totalsOf({});
    const samples = [
      sampleOf(status({ lockUs: 0, latencyUs: 0, ops: 0, out: 3, available: 125, queued: 0, dirtyBytes: 2_000_000, evictUs: 0 }), 1_000.4),
      sampleOf(status({ lockUs: 0, latencyUs: 0, ops: 0, out: 128, available: 0, queued: 40, dirtyBytes: 9_500_000, evictUs: 0 }), 2_000),
      sampleOf(status({ lockUs: 0, latencyUs: 0, ops: 0, out: 64, available: 64, queued: 10, dirtyBytes: 1_000_000, evictUs: 0 }), 3_000),
    ];
    const read = serverRead(totals, totals, samples);
    expect(samples[0]).toEqual({ at: 1_000, ticketsOut: 3, ticketsAvailable: 125, queuedWriters: 0, dirtyMb: 2 });
    expect(read).toMatchObject({ ticketsOutMax: 128, ticketsAvailableMin: 0, queuedWritersMax: 40, queuedWritersMedian: 10, dirtyMbMax: 9.5, serverWriteMs: null });
    expect(read.samples).toHaveLength(3);
  });

  it("reads the tickets of an older server from wiredTiger.concurrentTransactions", () => {
    const sample = sampleOf({ wiredTiger: { concurrentTransactions: { write: { out: 7, available: 121 } } } }, 0);
    expect(sample).toMatchObject({ ticketsOut: 7, ticketsAvailable: 121, queuedWriters: null, dirtyMb: null });
    expect(statusNumber({ a: { b: "x" } }, ["a", "b"])).toBeNull();
    expect(statusNumber({ a: 3 }, ["a", "b"])).toBeNull();
  });

  it("gives the cases of each tenant suite to the plan of the workflow", () => {
    expect(SUITE_CASES["tenant-partition"]).toEqual(PARTITION_CASES);
    expect(Object.keys(SUITE_CASES).sort()).toEqual(["tenant", "tenant-ceiling", "tenant-first", "tenant-partition", "tenant-separate"]);
  });
});
