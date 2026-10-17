/**
 * The two engines of `SqliteStorage` in a file: `node` (`node:sqlite`) against `sqljs` (sql.js).
 * The engine sqljs writes the whole file after each write, and the engine node writes only the
 * changed pages. The nightly workflow runs these benchmarks with `vitest bench`, and each one
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
import { SqliteStorage, isNodeSqliteAvailable, type SqliteEngineName } from "../src/storage.js";

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

const engines: SqliteEngineName[] = (await isNodeSqliteAvailable()) ? ["node", "sqljs"] : ["sqljs"];

// The writes of sql.js take seconds for each call: the test gets ten minutes
test("the engines of SqliteStorage in a file", { timeout: 600_000 }, async ({ bench }) => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-bench-"));
  const storages: Array<SqliteStorage<Item>> = [];
  try {
    const writers = new Map<SqliteEngineName, SqliteStorage<Item>>();
    const readers = new Map<SqliteEngineName, SqliteStorage<Item>>();
    for (const engine of engines) {
      const writer = new SqliteStorage<Item>({ path: join(dir, `write-${engine}.db`), table: "items", engine });
      await writer.setBatch(Array.from({ length: WRITES }, (_, n): [string, Item] => [`item${n}`, item(n)]));
      const reader = new SqliteStorage<Item>({ path: join(dir, `read-${engine}.db`), table: "items", engine });
      await reader.setBatch(Array.from({ length: READ }, (_, n): [string, Item] => [`item${n}`, item(n)]));
      writers.set(engine, writer);
      readers.set(engine, reader);
      storages.push(writer, reader);
    }

    let round = 0;
    // Each call of a write benchmark makes 1,000 writes: a few calls give a stable mean
    await bench.compare(
      ...engines.map((engine) =>
        bench(`sqlite-${engine}-file-write-1000`, result(`sqlite-${engine}-file-write-1000`), async () => {
          const storage = writers.get(engine)!;
          round++;
          for (let n = 0; n < WRITES; n++) await storage.set(`item${n}`, item(n + round));
        }),
      ),
      { iterations: 5, time: 0, warmupIterations: 1, warmupTime: 0 },
    );

    await bench.compare(
      ...engines.map((engine) =>
        bench(`sqlite-${engine}-file-read-10000`, result(`sqlite-${engine}-file-read-10000`), async () => {
          await readers.get(engine)!.getAll();
        }),
      ),
      { iterations: 20, time: 0, warmupIterations: 2, warmupTime: 0 },
    );
  } finally {
    for (const storage of storages) await storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
