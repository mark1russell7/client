/**
 * KeyedLock and withLock (roadmap O51): the order of the waiters, the skip, the release after a
 * throw, the abort of a wait, and no key left in the map.
 */

import { describe, expect, it } from "vitest";
import { KeyedLock, withLock } from "./lock.js";

/** A promise and the function that resolves it. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe("KeyedLock", () => {
  it("gives the key to the waiters in the order of their calls", async () => {
    const lock = new KeyedLock();
    const order: number[] = [];
    const first = gate();
    const holder = lock.run("k", async () => {
      order.push(0);
      await first.promise;
    });
    const waiters = [1, 2, 3, 4].map((n) => lock.run("k", () => void order.push(n)));
    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual([0]);
    first.open();
    await Promise.all([holder, ...waiters]);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(lock.size).toBe(0);
  });

  it("does not let a caller in between a release and the next waiter", async () => {
    const lock = new KeyedLock();
    const release = lock.tryAcquire("k")!;
    const next = lock.acquire("k");
    release();
    // The key belongs to the waiter now, before its promise resolves
    expect(lock.tryAcquire("k")).toBeUndefined();
    (await next)();
    expect(lock.size).toBe(0);
  });

  it("skips the function when the key has a holder", async () => {
    const lock = new KeyedLock();
    const held = gate();
    const holder = lock.run("k", () => held.promise);
    let calls = 0;
    expect(await lock.run("k", () => ++calls, { ifHeld: "skip" })).toEqual({ ran: false });
    expect(calls).toBe(0);
    held.open();
    await holder;
    expect(await lock.run("k", () => ++calls, { ifHeld: "skip" })).toEqual({ ran: true, value: 1 });
    expect(lock.size).toBe(0);
  });

  it("gives the key back when the function throws, also with a synchronous throw", async () => {
    const lock = new KeyedLock();
    await expect(
      lock.run("k", async () => {
        throw new Error("no");
      }),
    ).rejects.toThrow("no");
    expect(lock.isHeld("k")).toBe(false);
    await expect(
      lock.run("k", () => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");
    await expect(
      lock.run(
        "k",
        () => {
          throw new Error("skip");
        },
        { ifHeld: "skip" },
      ),
    ).rejects.toThrow("skip");
    expect(await lock.run("k", () => "after")).toBe("after");
    expect(lock.size).toBe(0);
  });

  it("keeps no key after many calls on many keys", async () => {
    const lock = new KeyedLock();
    const calls: Promise<number>[] = [];
    for (let n = 0; n < 200; n++) calls.push(lock.run(`key-${n % 7}`, async () => n));
    await Promise.all(calls);
    expect(lock.size).toBe(0);
  });

  it("stops a wait on an abort, takes the waiter out of the queue, and keeps no key", async () => {
    const lock = new KeyedLock();
    const release = lock.tryAcquire("k")!;
    const controller = new AbortController();
    let ran = false;
    const waiting = lock.run("k", () => (ran = true), { signal: controller.signal });
    const after = lock.run("k", () => "after");
    controller.abort(new Error("stop"));
    await expect(waiting).rejects.toThrow("stop");
    release();
    expect(await after).toBe("after");
    expect(ran).toBe(false);
    expect(lock.size).toBe(0);
  });

  it("refuses a signal that is aborted already", async () => {
    const lock = new KeyedLock();
    await expect(lock.acquire("k", { signal: AbortSignal.abort(new Error("early")) })).rejects.toThrow("early");
    expect(lock.size).toBe(0);
  });

  it("ignores a second call of a release", async () => {
    const lock = new KeyedLock();
    const release = lock.tryAcquire("k")!;
    const next = lock.acquire("k");
    release();
    const second = await next;
    // The first holder releases again: the key stays with the second holder
    release();
    expect(lock.isHeld("k")).toBe(true);
    second();
    expect(lock.size).toBe(0);
  });

  it("keeps the keys apart", async () => {
    const lock = new KeyedLock();
    const held = gate();
    const a = lock.run("a", () => held.promise);
    expect(await lock.run("b", () => "b")).toBe("b");
    held.open();
    await a;
  });
});

describe("withLock", () => {
  it("shares the keys of the process, waits and skips", async () => {
    const key = `with-lock-${Math.random()}`;
    const held = gate();
    const order: string[] = [];
    const first = withLock(key, async () => {
      order.push("first");
      await held.promise;
      return 1;
    });
    const second = withLock(key, () => {
      order.push("second");
      return 2;
    });
    expect(await withLock(key, () => order.push("skipped"), { ifHeld: "skip" })).toEqual({ ran: false });
    held.open();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(["first", "second"]);
    expect(await withLock(key, () => 3, { ifHeld: "skip" })).toEqual({ ran: true, value: 3 });
  });
});
