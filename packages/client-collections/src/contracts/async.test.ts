/**
 * AsyncQueue and channels (regressions: BUGS-2026-07 C11, the queue dropped the elements of
 * waiting puts and left takers waiting, and L17, an unbuffered channel had a buffer of 1).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asyncQueue } from "../async/async-queue.js";
import { channel, unbuffered } from "../async/channels.js";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("AsyncQueue", () => {
  it("keeps every element and their order, with any capacity and any interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }),
        async (capacity, script) => {
          const queue = asyncQueue<number>({ capacity });
          const puts: Promise<void>[] = [];
          const takes: Promise<number>[] = [];
          let next = 0;
          // true: put the next number, false: take. Takes never outnumber puts at the end.
          for (const isPut of script) {
            if (isPut) puts.push(queue.put(next++));
            else if (takes.length < next) takes.push(queue.take());
            await tick();
          }
          while (takes.length < next) takes.push(queue.take());
          await Promise.all(puts);
          expect(await Promise.all(takes)).toEqual([...Array(next).keys()]);
          expect(queue.size).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("makes put wait when the buffer is full (back-pressure)", async () => {
    const queue = asyncQueue<string>({ capacity: 1 });
    await queue.put("a");
    let done = false;
    const second = queue.put("b").then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    expect(await queue.take()).toBe("a");
    await second;
    expect(await queue.take()).toBe("b");
  });

  it("with capacity 0, hands each element from put to take directly", async () => {
    const queue = asyncQueue<number>({ capacity: 0 });
    expect(queue.tryPut(1)).toBe(false);
    const taken = queue.take();
    expect(queue.tryPut(2)).toBe(true);
    expect(await taken).toBe(2);
    const put = queue.put(3);
    expect(await queue.tryPeek()).toBe(3);
    expect(queue.tryTake()).toBe(3);
    await put;
  });

  it("drain gives the buffer and the waiting puts, in order", async () => {
    const queue = asyncQueue<number>({ capacity: 2 });
    const puts = [1, 2, 3, 4].map((n) => queue.put(n));
    await tick();
    expect(queue.drain()).toEqual([1, 2, 3, 4]);
    await Promise.all(puts);
  });

  it("close lets the reader finish the elements, then the iterator ends", async () => {
    const queue = asyncQueue<number>();
    await queue.put(1);
    await queue.put(2);
    queue.close();
    await expect(queue.put(3)).rejects.toThrow("closed");
    const seen: number[] = [];
    for await (const n of queue) seen.push(n);
    expect(seen).toEqual([1, 2]);
    await expect(queue.take()).rejects.toThrow("closed");
  });

  it("close ends a reader that waits", async () => {
    const queue = asyncQueue<number>();
    const seen: number[] = [];
    const reader = (async () => {
      for await (const n of queue) seen.push(n);
    })();
    await queue.put(1);
    await tick();
    queue.close();
    await reader;
    expect(seen).toEqual([1]);
  });

  it("take and put time out", async () => {
    const queue = asyncQueue<number>({ capacity: 0 });
    await expect(queue.take(10)).rejects.toThrow("timeout");
    await expect(queue.put(1, 10)).rejects.toThrow("timeout");
    expect(queue.getStats()).toMatchObject({ waitingPutters: 0, waitingTakers: 0 });
  });
});

describe("Channel", () => {
  it("an unbuffered channel makes send wait for a receiver (L17)", async () => {
    const ch = unbuffered<string>();
    expect(ch.trySend("x")).toBe(false);
    let sent = false;
    const send = ch.send("hello").then(() => (sent = true));
    await tick();
    expect(sent).toBe(false);
    expect(await ch.receive()).toBe("hello");
    await send;
    expect(sent).toBe(true);
  });

  it("a buffered channel takes its buffer size without a receiver", async () => {
    const ch = channel<number>(2);
    expect(ch.trySend(1)).toBe(true);
    expect(ch.trySend(2)).toBe(true);
    expect(ch.trySend(3)).toBe(false);
    ch.close();
    const seen: number[] = [];
    for await (const n of ch) seen.push(n);
    expect(seen).toEqual([1, 2]);
  });
});
