/**
 * `SqliteStorage` in a file, on `node:sqlite`. Version 0.61.0 removed the engine `sqljs`, so the names of the
 * results keep the engine `node`. The nightly workflow runs these benchmarks with `vitest bench`, and each one
 * writes its result to `bench/results/`. Run them in CI, not on a shared machine.
 *
 * - `write-1000`: 1,000 calls of `set()`, one after the other, in a table of 1,000 items.
 * - `read-10000`: one `getAll()` of a table of 10,000 items.
 *
 * Vitest 5 gives the benchmarks as the `bench` fixture of a test.
 */

import { test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStorage } from "../src/storage.js";

/** An item of the size of a procedure record: a path, metadata with lists, and a time. */
interface Item {
  path: string[];
  metadata: { description: string; tags: string[]; effects: { reads: string[]; writes: string[] } };
  storedAt: number;
}

const item = (n: number): Item => ({
  path: ["bench", "items", `item${n}`],
  metadata: { description: `The item number ${n}`, tags: ["bench", "storage", `n${n % 10}`], effects: { reads: ["collection:items"], writes: [] } },
  storedAt: 1_760_000_000_000 + n,
});

const WRITES = 1000;
const READ = 10_000;

/** The file of the result of one benchmark. */
const result = (name: string) => ({ writeResult: `bench/results/${name}.json` });

test("SqliteStorage in a file", { timeout: 600_000 }, async ({ bench }) => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-bench-"));
  const writer = new SqliteStorage<Item>({ path: join(dir, "write-node.db"), table: "items", engine: "node" });
  const reader = new SqliteStorage<Item>({ path: join(dir, "read-node.db"), table: "items", engine: "node" });
  try {
    await writer.setBatch(Array.from({ length: WRITES }, (_, n): [string, Item] => [`item${n}`, item(n)]));
    await reader.setBatch(Array.from({ length: READ }, (_, n): [string, Item] => [`item${n}`, item(n)]));

    let round = 0;
    // Each call of the write benchmark makes 1,000 writes: a few calls give a stable mean
    await bench("sqlite-node-file-write-1000", result("sqlite-node-file-write-1000"), async () => {
      round++;
      for (let n = 0; n < WRITES; n++) await writer.set(`item${n}`, item(n + round));
    }).run({ iterations: 5, time: 0, warmupIterations: 1, warmupTime: 0 });

    await bench("sqlite-node-file-read-10000", result("sqlite-node-file-read-10000"), async () => {
      await reader.getAll();
    }).run({ iterations: 20, time: 0, warmupIterations: 2, warmupTime: 0 });
  } finally {
    await writer.close();
    await reader.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
