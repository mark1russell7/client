/**
 * A full pull of `HybridStorage` with 1,000 items. A full pull must find the local ids that the
 * remote does not have.
 *
 * - `before`: the local copy has no `getIds()`, so the pull reads each local entry, and the local
 *   copy copies each value (`structuredClone`). Each pull did this before `getIds()`.
 * - `after`: the local copy is an `InMemoryStorage` with `getIds()`. The pull reads only the ids.
 * - `versions`: as `after`, with `versionOf`. The storage knows the version of each local item, so
 *   the pull reads no local item.
 *
 * The remote has no `getChangesSince`, so each pull is a full pull. The nightly workflow runs these
 * benchmarks with `vitest bench`, and each one writes its result to `bench/results/`. Run them in
 * CI, not on a shared machine.
 *
 * Vitest 5 gives the benchmarks as the `bench` fixture of a test.
 */

import { test } from "vitest";
import { InMemoryStorage } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage } from "../src/storage/hybrid.js";

/** An item of the size of a procedure record: a path, metadata with lists, and a time. */
interface Item {
  id: string;
  path: string[];
  metadata: { description: string; tags: string[]; effects: { reads: string[]; writes: string[] } };
  storedAt: number;
}

const item = (n: number): Item => ({
  id: `item${n}`,
  path: ["bench", "items", `item${n}`],
  metadata: { description: `The item number ${n}`, tags: ["bench", "storage", `n${n % 10}`], effects: { reads: ["collection:items"], writes: [] } },
  storedAt: 1_760_000_000_000 + n,
});

const COUNT = 1000;
const items = Array.from({ length: COUNT }, (_, n): [string, Item] => [`item${n}`, item(n)]);

/** A remote without a change log: each pull reads all entries. */
async function fullRemote(): Promise<InMemoryStorage<Item>> {
  const remote = new InMemoryStorage<Item>();
  await remote.setBatch(items);
  return Object.assign(remote, { getChangesSince: undefined });
}

/** A hybrid storage after its first pull: the local copy has the 1,000 items of the remote. */
async function pulled(withIds: boolean, withVersions = false): Promise<HybridStorage<Item>> {
  const local = new InMemoryStorage<Item>();
  const hybrid = new HybridStorage<Item>(await fullRemote(), {
    mode: "write-through",
    syncInterval: ms(0),
    local: withIds ? local : Object.assign(local, { getIds: undefined }),
    ...(withVersions && { versionOf: (stored: Item) => String(stored.storedAt) }),
  });
  await hybrid.syncFromRemote();
  return hybrid;
}

/** The file of the result of one benchmark. */
const result = (name: string) => ({ writeResult: `bench/results/${name}.json` });

test("the full pull of HybridStorage", async ({ bench }) => {
  const before = await pulled(false);
  const after = await pulled(true);
  const versions = await pulled(true, true);
  try {
    await bench.compare(
      bench("hybrid-full-pull-1000-before", result("hybrid-full-pull-1000-before"), async () => {
        await before.syncFromRemote();
      }),
      bench("hybrid-full-pull-1000-after", result("hybrid-full-pull-1000-after"), async () => {
        await after.syncFromRemote();
      }),
      bench("hybrid-full-pull-1000-versions", result("hybrid-full-pull-1000-versions"), async () => {
        await versions.syncFromRemote();
      }),
    );
  } finally {
    await before.close();
    await after.close();
    await versions.close();
  }
});
