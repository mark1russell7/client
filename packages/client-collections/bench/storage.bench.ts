/**
 * The cost of the copies of `InMemoryStorage` (the contract of `CollectionStorage`): the storage
 * with copies (`structuredClone` at each write and each read) against the option `copies: false`.
 * The nightly workflow runs these benchmarks with `vitest bench`, and each one writes its result to
 * `bench/results/`. Run them in CI, not on a shared machine.
 *
 * Vitest 5 gives the benchmarks as the `bench` fixture of a test.
 */

import { test } from "vitest";
import { InMemoryStorage } from "../src/storage/memory.js";

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

const COUNT = 1000;
const items = Array.from({ length: COUNT }, (_, n): [string, Item] => [`item${n}`, item(n)]);

/** A storage with the items, with or without copies. */
async function filled(copies: boolean): Promise<InMemoryStorage<Item>> {
  const storage = new InMemoryStorage<Item>({ copies });
  await storage.setBatch(items);
  return storage;
}

/** The file of the result of one benchmark. */
const result = (name: string) => ({ writeResult: `bench/results/${name}.json` });

/** A storage with the items and ten changes after a version, for a small delta. */
async function withDelta(copies: boolean): Promise<{ storage: InMemoryStorage<Item>; version: string }> {
  const storage = await filled(copies);
  const { version } = await storage.getChangesSince();
  for (let index = 0; index < 10; index++) await storage.set(`item${index}`, item(index + COUNT));
  return { storage, version };
}

test("the copies of InMemoryStorage", async ({ bench }) => {
  // The writes of the set benchmarks go to their own storages: the other storages do not change
  const writeWithCopies = await filled(true);
  const writeWithoutCopies = await filled(false);
  const withCopies = await filled(true);
  const withoutCopies = await filled(false);
  const delta = await withDelta(true);
  const deltaWithout = await withDelta(false);
  const one = item(1);
  let n = 0;

  await bench.compare(
    bench("structured-clone-one-item", result("storage-structured-clone-one-item"), () => {
      structuredClone(one);
    }),
    bench("memory-set-copies", result("storage-memory-set-copies"), async () => {
      await writeWithCopies.set(`item${n++ % COUNT}`, one);
    }),
    bench("memory-set-no-copies", result("storage-memory-set-no-copies"), async () => {
      await writeWithoutCopies.set(`item${n++ % COUNT}`, one);
    }),
    bench("memory-get-copies", result("storage-memory-get-copies"), async () => {
      await withCopies.get(`item${n++ % COUNT}`);
    }),
    bench("memory-get-no-copies", result("storage-memory-get-no-copies"), async () => {
      await withoutCopies.get(`item${n++ % COUNT}`);
    }),
    bench("memory-getall-1000-copies", result("storage-memory-getall-1000-copies"), async () => {
      await withCopies.getAll();
    }),
    bench("memory-getall-1000-no-copies", result("storage-memory-getall-1000-no-copies"), async () => {
      await withoutCopies.getAll();
    }),
    bench("memory-delta-10-copies", result("storage-memory-delta-10-copies"), async () => {
      await delta.storage.getChangesSince(delta.version);
    }),
    bench("memory-delta-10-no-copies", result("storage-memory-delta-10-no-copies"), async () => {
      await deltaWithout.storage.getChangesSince(deltaWithout.version);
    }),
  );
});
