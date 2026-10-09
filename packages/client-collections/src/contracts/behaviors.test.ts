/**
 * The behaviors (regressions: BUGS-2026-07 L11, synchronized locked after the operation and
 * readWriteLock counted readers twice; L12, safeDeque.poll removed two elements; L14, readonly
 * did not block setIfAbsent or the writable views).
 */

import { describe, it, expect } from "vitest";
import { arrayDeque } from "../impl/array-deque.js";
import { hashMap } from "../impl/hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import { arrayList } from "../impl/array-list.js";
import { safeDeque } from "../behaviors/safe.js";
import { readonly } from "../behaviors/readonly.js";
import { synchronized, readWriteLock } from "../behaviors/synchronized.js";
import { isSome, isNone } from "../core/effects.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("safeDeque (L12)", () => {
  it("poll removes one element and returns it", () => {
    const deque = safeDeque<number>()(arrayDeque([1, 2, 3]));
    const first = deque.safe.poll();
    expect(isSome(first) && first.value).toBe(1);
    expect(deque.toArray()).toEqual([2, 3]);
    deque.clear();
    expect(isNone(deque.safe.poll())).toBe(true);
  });
});

describe("readonly (L14)", () => {
  it("blocks every mutation of a map, also setIfAbsent and the poll methods", () => {
    const map = readonly<ReturnType<typeof treeMap<number, string>>>()(treeMap<number, string>([[1, "a"], [2, "b"]]));
    for (const mutate of [
      () => map.set(3, "c"),
      () => map.setIfAbsent(3, "c"),
      () => map.delete(1),
      () => map.pollFirstEntry(),
      () => map.pollLastEntry(),
      () => map.merge(1, "x", (a, b) => a + b),
      () => map.clear(),
    ]) {
      expect(mutate).toThrow("readonly");
    }
    expect(map.get(1)).toBe("a");
    expect(map.size).toBe(2);
  });

  it("makes the views readonly too", () => {
    const map = readonly<ReturnType<typeof treeMap<number, string>>>()(treeMap<number, string>([[1, "a"], [2, "b"]]));
    expect(() => map.headMap(2).set(0, "z")).toThrow("readonly");
    expect(() => map.descendingMap().clear()).toThrow("readonly");
    const list = readonly<ReturnType<typeof arrayList<number>>>()(arrayList([1, 2, 3]));
    expect(() => list.subList(0, 2).add(9)).toThrow("readonly");
    expect(list.toArray()).toEqual([1, 2, 3]);
  });
});

/** A collection with an async method whose body awaits: overlapping calls interleave without a lock. */
class AsyncCounter {
  value = 0;
  log: string[] = [];
  async increment(label: string): Promise<number> {
    this.log.push(`start ${label}`);
    const read = this.value;
    await sleep(5);
    this.value = read + 1;
    this.log.push(`end ${label}`);
    return this.value;
  }
  peek(): number {
    return this.value;
  }
}

describe("synchronized (L11)", () => {
  it("runs the async calls one after the other", async () => {
    const counter = synchronized<AsyncCounter>()(new AsyncCounter());
    await Promise.all([counter.increment("a"), counter.increment("b"), counter.increment("c")]);
    // Without the lock, the three calls read 0 and the result is 1
    expect(counter.value).toBe(3);
    expect(counter.log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("runs a plain method at once", () => {
    const counter = synchronized<AsyncCounter>()(new AsyncCounter());
    expect(counter.peek()).toBe(0);
  });
});

describe("readWriteLock (L11)", () => {
  it("lets a writer in after readers that were woken by a writer", async () => {
    const map = readWriteLock<ReturnType<typeof hashMap<string, number>>>()(hashMap<string, number>());
    const locked = map as unknown as {
      set(key: string, value: number): Promise<number | undefined>;
      get(key: string): Promise<number>;
    };
    // A writer holds the lock while readers queue; then the readers run; then a second writer must get the lock
    const first = locked.set("a", 1);
    const readers = [locked.get("a"), locked.get("a")];
    await first;
    expect(await Promise.all(readers)).toEqual([1, 1]);
    const second = await Promise.race([locked.set("a", 2).then(() => "written"), sleep(200).then(() => "starved")]);
    expect(second).toBe("written");
    expect(await locked.get("a")).toBe(2);
  });
});
