/**
 * AsyncQueue and channels (regressions: BUGS-2026-07 C11, the queue dropped the elements of
 * waiting puts and left takers waiting, and L17, an unbuffered channel had a buffer of 1).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asyncQueue } from "../async/async-queue.js";
import { channel, merge, select, timeout, unbuffered, type Channel } from "../async/channels.js";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The value of a promise, or a failure when it does not settle in time: a lost value makes a receive wait forever. */
async function within<T>(promise: Promise<T>, what: string, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle: a value was lost`)), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

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

describe("select (audit O56 #4: the cases that lose keep no receive)", () => {
  it("withdraws the receive of each case that loses, so a later send finds no receiver", async () => {
    const a = channel<string>();
    const b = channel<string>();
    const first = select(a.case((v) => `a:${v}`), b.case((v) => `b:${v}`));
    await tick();
    expect(a.trySend("1")).toBe(true);
    expect(await first).toBe("a:1");
    // Before the fix, the receive of the case b still waited: it took "2" and dropped it
    expect(b.trySend("2")).toBe(false);
    const sent = b.send("2");
    expect(await within(b.receive(), "receive")).toBe("2");
    await sent;
  });

  it("two sends in one tick: the first wins, and the second stays for the next receiver", async () => {
    const a = channel<number>();
    const b = channel<number>(1);
    const first = select(a.case((v) => `a${v}`), b.case((v) => `b${v}`));
    await tick();
    expect(a.trySend(1)).toBe(true);
    expect(b.trySend(2)).toBe(true);
    expect(await first).toBe("a1");
    expect(b.size).toBe(1);
    expect(await within(select(a.case((v) => `a${v}`), b.case((v) => `b${v}`)), "select")).toBe("b2");
  });

  it("a loop of select calls gets each value one time, in the order of each channel", async () => {
    const a = channel<number>(2);
    const b = channel<number>();
    const got: string[] = [];
    const loop = (async () => {
      for (let i = 0; i < 6; i++) got.push(await select(a.case((v) => `a${v}`), b.case((v) => `b${v}`)));
    })();
    const sends: Promise<void>[] = [];
    for (let i = 1; i <= 3; i++) {
      await tick();
      sends.push(a.send(i));
      await tick();
      sends.push(b.send(i));
    }
    await within(loop, "the loop of select calls");
    await within(Promise.all(sends), "the sends");
    expect(got.filter((v) => v.startsWith("a"))).toEqual(["a1", "a2", "a3"]);
    expect(got.filter((v) => v.startsWith("b"))).toEqual(["b1", "b2", "b3"]);
  });

  it("gives a value that is undefined, from a channel that has it at once", async () => {
    const done = channel<void>(1);
    const data = channel<number>();
    expect(done.trySend(undefined)).toBe(true);
    expect(await within(select(data.case((v) => `data ${v}`), done.case(() => "done")), "select")).toBe("done");
    expect(done.size).toBe(0);
    expect(data.trySend(1)).toBe(false);
  });

  it("a timeout case leaves no receive on the data channel", async () => {
    const data = channel<number>();
    expect(await select(data.case((v) => `data ${v}`), timeout(5).case(() => "timeout"))).toBe("timeout");
    expect(data.trySend(1)).toBe(false);
  });

  it("rejects for a closed channel, and withdraws the receives of the other cases", async () => {
    const a = channel<number>();
    const b = channel<number>();
    b.close();
    await expect(select(a.case((v) => v), b.case((v) => v))).rejects.toThrow("closed");
    expect(a.trySend(1)).toBe(false);
  });

  it("keeps each value one time and the order of each channel, with any capacity and any interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 2, maxLength: 3 }),
        fc.array(fc.record({ send: fc.boolean(), to: fc.nat({ max: 2 }), wait: fc.boolean() }), { minLength: 1, maxLength: 40 }),
        async (capacities, script) => {
          const channels = capacities.map((capacity) => channel<number>(capacity));
          const sent: number[][] = channels.map(() => []);
          const got: number[][] = channels.map(() => []);
          const pending: Promise<unknown>[] = [];
          let values = 0;
          let selects = 0;
          const startSelect = (): void => {
            selects++;
            pending.push(select(...channels.map((ch, index) => ch.case((value: number) => got[index]!.push(value)))));
          };
          const send = (index: number): void => {
            sent[index]!.push(values);
            pending.push(channels[index]!.send(values++));
          };
          // A send of the next number to a channel, or a select that can wait for a value
          for (const step of script) {
            if (step.send) send(step.to % channels.length);
            else startSelect();
            if (step.wait) await tick();
          }
          // The same number of sends and selects: each select gets one value
          while (values < selects) send(values % channels.length);
          while (selects < values) startSelect();
          await within(Promise.all(pending), "a send or a select", 500);
          expect(got).toEqual(sent);
          expect(channels.map((ch) => ch.size)).toEqual(channels.map(() => 0));
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("merge (audit O56 #6: no value of an input is lost)", () => {
  it("passes on every value of each input, in the order of each input", async () => {
    const a = channel<number>();
    const b = channel<number>();
    const out = merge(a, b);
    const sends = [a.send(1), b.send(11), a.send(2), b.send(12), a.send(3), b.send(13)];
    const got: number[] = [];
    for (let i = 0; i < 6; i++) got.push(await within(out.receive(), `receive ${i + 1}`));
    await Promise.all(sends);
    expect(got.filter((v) => v < 10)).toEqual([1, 2, 3]);
    expect(got.filter((v) => v > 10)).toEqual([11, 12, 13]);
  });

  it("takes the inputs in turn, so a busy input does not starve the others", async () => {
    const a = channel<string>(4);
    const b = channel<string>(4);
    for (const v of ["a1", "a2", "a3"]) await a.send(v);
    for (const v of ["b1", "b2", "b3"]) await b.send(v);
    const out = merge(a, b);
    const got: string[] = [];
    for (let i = 0; i < 6; i++) got.push(await within(out.receive(), `receive ${i + 1}`));
    expect(got).toEqual(["a1", "b1", "a2", "b2", "a3", "b3"]);
  });

  it("closes when the first input closes, and leaves no receive on the other inputs", async () => {
    const a = channel<number>();
    const b = channel<number>();
    const out = merge(a, b);
    const sent = a.send(1);
    expect(await within(out.receive(), "receive")).toBe(1);
    await sent;
    a.close();
    const end = await within(out.receive().then(() => "value", () => "closed"), "the end of the output");
    expect(end).toBe("closed");
    // Before the fix, the pending receive of b took this value and dropped it
    expect(b.trySend(5)).toBe(false);
  });

  it("keeps each value one time and the order of each input, with any capacity and any interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 2, maxLength: 3 }),
        fc.array(fc.record({ send: fc.boolean(), to: fc.nat({ max: 2 }), wait: fc.boolean() }), { minLength: 1, maxLength: 40 }),
        async (capacities, script) => {
          const inputs: Channel<number>[] = capacities.map((capacity) => channel<number>(capacity));
          const out = merge(...inputs);
          const sent: number[][] = inputs.map(() => []);
          const origin = new Map<number, number>();
          const sends: Promise<void>[] = [];
          const receives: Promise<number>[] = [];
          let values = 0;
          // A send of the next number to an input, or a receive of the output
          for (const step of script) {
            if (step.send) {
              const index = step.to % inputs.length;
              sent[index]!.push(values);
              origin.set(values, index);
              sends.push(inputs[index]!.send(values++));
            } else if (receives.length < values) {
              receives.push(out.receive());
            }
            if (step.wait) await tick();
          }
          while (receives.length < values) receives.push(out.receive());
          const got = await within(Promise.all(receives), "a receive of the output", 500);
          await within(Promise.all(sends), "a send of an input", 500);
          const byInput: number[][] = inputs.map(() => []);
          for (const value of got) byInput[origin.get(value)!]!.push(value);
          expect(byInput).toEqual(sent);
        },
      ),
      { numRuns: 100 },
    );
  });
});
