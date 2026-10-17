import { describe, expect, it } from "vitest";
import { asSettled, type Settled } from "./settled.js";

/** A promise that settles after `ms` milliseconds, with `value` or with the error `reason`. */
const after = <T>(ms: number, value: T, reason?: string): Promise<T> =>
  new Promise((resolve, reject) => {
    setTimeout(() => (reason === undefined ? resolve(value) : reject(new Error(reason))), ms);
  });

const collect = async <T>(results: AsyncIterable<Settled<T>>): Promise<Settled<T>[]> => {
  const out: Settled<T>[] = [];
  for await (const result of results) out.push(result);
  return out;
};

describe("asSettled", () => {
  it("gives each result in settle order, with the index of its promise", async () => {
    const results = await collect(asSettled([after(30, "slow"), after(5, "fast"), after(15, "middle")]));
    expect(results).toEqual([
      { index: 1, status: "fulfilled", value: "fast" },
      { index: 2, status: "fulfilled", value: "middle" },
      { index: 0, status: "fulfilled", value: "slow" },
    ]);
  });

  it("gives a rejection as a result and does not throw it", async () => {
    const results = await collect(asSettled([after(10, 1), after(1, 0, "refused")]));
    expect(results[0]).toMatchObject({ index: 1, status: "rejected" });
    expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(results[1]).toEqual({ index: 0, status: "fulfilled", value: 1 });
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
      for await (const result of asSettled([after(1, "first"), after(5, "never", "late")])) {
        expect(result.index).toBe(0);
        break;
      }
      await after(20, undefined);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
