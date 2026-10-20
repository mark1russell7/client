import { describe, expect, it } from "vitest";
import { asSettled, type Settled } from "./settled.js";

/**
 * A promise and the functions that settle it. The tests settle each promise in an explicit order,
 * so no clock decides the order (a loaded runner can delay a short timer past a long one).
 */
const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** The end of the current turn: each callback of the promises that settled has run. It decides no order. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const collect = async <T>(results: AsyncIterable<Settled<T>>): Promise<Settled<T>[]> => {
  const out: Settled<T>[] = [];
  for await (const result of results) out.push(result);
  return out;
};

describe("asSettled", () => {
  it("gives each result in settle order, with the index of its promise", async () => {
    const [slow, fast, middle] = [deferred<string>(), deferred<string>(), deferred<string>()];
    const results = collect(asSettled([slow.promise, fast.promise, middle.promise]));
    fast.resolve("fast");
    await tick();
    middle.resolve("middle");
    await tick();
    slow.resolve("slow");
    expect(await results).toEqual([
      { index: 1, status: "fulfilled", value: "fast" },
      { index: 2, status: "fulfilled", value: "middle" },
      { index: 0, status: "fulfilled", value: "slow" },
    ]);
  });

  it("gives a rejection as a result and does not throw it", async () => {
    const [ok, refused] = [deferred<number>(), deferred<number>()];
    const results = collect(asSettled([ok.promise, refused.promise]));
    refused.reject(new Error("refused"));
    await tick();
    ok.resolve(1);
    const settled = await results;
    expect(settled[0]).toMatchObject({ index: 1, status: "rejected" });
    expect((settled[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(settled[1]).toEqual({ index: 0, status: "fulfilled", value: 1 });
  });

  it("gives nothing for no promises, and takes any iterable", async () => {
    expect(await collect(asSettled([]))).toEqual([]);
    const set = new Set([Promise.resolve("a")]);
    expect(await collect(asSettled(set))).toEqual([{ index: 0, status: "fulfilled", value: "a" }]);
  });

  it("lets the consumer stop early without an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const [first, late] = [deferred<string>(), deferred<string>()];
      const consumed = (async () => {
        for await (const result of asSettled([first.promise, late.promise])) {
          expect(result.index).toBe(0);
          break;
        }
      })();
      first.resolve("first");
      await consumed;
      // The consumer stopped. A later rejection of a promise that it did not take must not escape.
      late.reject(new Error("late"));
      await tick();
      await tick();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
