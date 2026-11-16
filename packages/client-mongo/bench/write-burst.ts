/**
 * One source of the store in a write child: its stores on its own database, and its bursts. A paired child
 * (roadmap CLI-114) opens three sources in one process. Each source folder has its own module of the connection,
 * so each source has its own connection and its own database.
 */

import { quantile, median } from "@mark1russell7/rigor-statistics";
import { STORES, WRITE_BYTES, keepError, type KeptError, type WriteCount, type WriteShape } from "./write-cases.js";

/** One source of a write child, with its stores made and their first writes done. */
export interface WriteSource {
  /** This function sends one burst: `writes` writes to each store, at the same time. It gives the time of the burst in milliseconds. */
  burst(tag: string): Promise<number>;
  /** This function gives the counts of the source for the file of the counts, with the bursts in their order. */
  count(job: string, arm: string, caseName: string): WriteCount;
  /** This function drops the database of the source and closes its connection. */
  close(): Promise<void>;
}

/**
 * This function opens the source in the folder `root`, relative to this file, on the database `database`.
 * It makes the stores of the shape and writes one document to each store: that write makes the indexes and the counter.
 */
export async function openSource(root: string, url: string, database: string, shape: WriteShape, writes: number): Promise<WriteSource> {
  const { MongoDocumentStorage } = (await import(`${root}/storage/document-storage.ts`)) as typeof import("../src/storage/document-storage.js");
  const { configure, disconnect, ensureConnection } = (await import(`${root}/connection.ts`)) as typeof import("../src/connection.js");
  configure({ uri: url, database });

  type Store = InstanceType<typeof MongoDocumentStorage<{ text: string }>>;
  const make = (index: number): Store => {
    if (shape === "many") return new MongoDocumentStorage<{ text: string }>({ collection: `docs${index}` });
    if (shape === "part") return new MongoDocumentStorage<{ text: string }>({ collection: "docs", partition: `t${index}` });
    return new MongoDocumentStorage<{ text: string }>({ collection: "docs" });
  };
  const stores = Array.from({ length: shape === "one" ? 1 : STORES }, (_, index) => make(index));
  const text = "x".repeat(WRITE_BYTES);
  for (const store of stores) await store.set("first", { text });

  const times: number[] = [];
  const burstTimesMs: number[] = [];
  const errors: Record<string, KeptError> = {};
  let failures = 0;
  const write = async (store: Store, id: string): Promise<void> => {
    const began = performance.now();
    try {
      await store.set(id, { text });
      times.push(performance.now() - began);
    } catch (error) {
      failures++;
      keepError(errors, error);
    }
  };

  return {
    async burst(tag) {
      const began = performance.now();
      await Promise.all(stores.flatMap((store) => Array.from({ length: writes }, (_, index) => write(store, `${tag}-${index}`))));
      const ms = performance.now() - began;
      burstTimesMs.push(ms);
      return ms;
    },
    count(job, arm, caseName) {
      const burstMs = burstTimesMs.reduce((sum, time) => sum + time, 0);
      return {
        job,
        arm,
        case: caseName,
        burstMs,
        medianBurstMs: burstTimesMs.length === 0 ? 0 : median(burstTimesMs),
        burstTimesMs: burstTimesMs.map((time) => Number(time.toFixed(1))),
        writesPerSecond: burstMs === 0 ? 0 : (times.length / burstMs) * 1000,
        p95Ms: times.length === 0 ? 0 : quantile(times, 0.95),
        failures,
        errors,
      };
    },
    async close() {
      await (await ensureConnection()).getDb().dropDatabase().catch(() => undefined);
      await disconnect();
    },
  };
}
