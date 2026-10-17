/**
 * The retry middleware with streams (regression: BUGS-2026-07 M2: it collected the whole
 * stream before it yielded anything, so a stream that does not end never gave an item). The
 * other parts of this file examine the overrides of a call, the ids of the tries, the aborts,
 * the hooks and the budget.
 */

import { describe, it, expect } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { Client } from "../client.js";
import { ClientError } from "../types.js";
import { createRetryMiddleware } from "./retry.js";
import type { Message, ResponseItem, Transport } from "../types.js";
import type { Clock } from "../../clock.js";
import { ms, seconds } from "../../duration.js";

function item<T>(id: string, payload: T): ResponseItem<T> {
  return { id, status: { type: "success", code: 200 }, payload, metadata: {} };
}

function retryableError<T>(id: string): ResponseItem<T> {
  return { id, status: { type: "error", code: "UNAVAILABLE", message: "try again", retryable: true }, payload: null as T, metadata: {} };
}

/** A transport whose attempts give the item lists in order. */
function scripted(attempts: Array<Array<"error" | number>>): { transport: Transport; calls: () => number } {
  let call = 0;
  const transport = {
    name: "scripted",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      const script = attempts[Math.min(call, attempts.length - 1)]!;
      call++;
      for (const step of script) {
        yield (step === "error" ? retryableError<TRes>(message.id) : item(message.id, step as TRes));
      }
    },
    close: async () => {},
  } as Transport;
  return { transport, calls: () => call };
}

const method = { service: "test", operation: "stream" };

describe("retry with streams", () => {
  it("passes each item through as it arrives (no buffering)", async () => {
    let produced = 0;
    const endless = {
      name: "endless",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        for (;;) {
          produced++;
          yield item(message.id, produced as TRes);
        }
      },
      close: async () => {},
    } as Transport;
    const client = new Client(endless).use(createRetryMiddleware({ retryDelay: ms(1) }));
    const seen: number[] = [];
    for await (const n of client.stream<unknown, number>(method, {})) {
      seen.push(n);
      if (seen.length === 3) break;
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(produced).toBe(3);
  });

  it("retries a retryable error before the first item", async () => {
    const { transport, calls } = scripted([["error"], ["error"], [1, 2, 3]]);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0 }));
    const seen: number[] = [];
    for await (const n of client.stream<unknown, number>(method, {})) seen.push(n);
    expect(seen).toEqual([1, 2, 3]);
    expect(calls()).toBe(3);
  });

  it("does not retry an error after the first item: a retry would repeat items", async () => {
    const { transport, calls } = scripted([[1, 2, "error"], [1, 2, 3]]);
    const client = new Client({ transport, throwOnError: false }).use(createRetryMiddleware({ retryDelay: ms(1) }));
    const seen: unknown[] = [];
    for await (const n of client.stream<unknown, unknown>(method, {})) seen.push(n);
    expect(seen).toEqual([1, 2, null]);
    expect(calls()).toBe(1);
  });

  it("gives the error after the last attempt", async () => {
    const { transport, calls } = scripted([["error"]]);
    const client = new Client(transport).use(createRetryMiddleware({ maxRetries: 2, retryDelay: ms(1), jitter: 0 }));
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(calls()).toBe(3);
  });

  it("keeps the request/response behavior: call() retries until success", async () => {
    const { transport, calls } = scripted([["error"], [42]]);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0 }));
    expect(await client.call(method, {})).toBe(42);
    expect(calls()).toBe(2);
  });
});

describe("onAfterRetry when the reader stops at the error (a Client with throwOnError)", () => {
  // Before, the hook came after the yield of the error item. The Client stops reading there,
  // so the hook did not run for a failure.
  it("hears of the failure after the last attempt", async () => {
    const after: Array<[boolean, number]> = [];
    const { transport } = scripted([["error"]]);
    const client = new Client(transport).use(
      createRetryMiddleware({ maxRetries: 1, retryDelay: ms(1), jitter: 0, onAfterRetry: (success, attempt) => void after.push([success, attempt]) }),
    );
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(after).toEqual([[false, 1]]);
  });

  it("hears of the failure when onBeforeRetry refuses the retry", async () => {
    const after: Array<[boolean, number]> = [];
    const { transport } = scripted([["error"]]);
    const client = new Client(transport).use(
      createRetryMiddleware({
        retryDelay: ms(1),
        onBeforeRetry: () => ({ shouldRetry: false }),
        onAfterRetry: (success, attempt) => void after.push([success, attempt]),
      }),
    );
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(after).toEqual([[false, 0]]);
  });

  it("hears of the failure when the budget refuses the retry", async () => {
    const after: Array<[boolean, number]> = [];
    const { transport } = scripted([["error"]]);
    const client = new Client(transport).use(
      createRetryMiddleware({
        maxRetries: 1,
        retryDelay: ms(1),
        jitter: 0,
        budget: { ratio: 0.01, minPerSecond: 0 },
        onAfterRetry: (success, attempt) => void after.push([success, attempt]),
      }),
    );
    // The budget has one retry: the first call takes it, the second call gets none
    await expect(client.call(method, {})).rejects.toThrow("try again");
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(after).toEqual([
      [false, 1],
      [false, 0],
    ]);
  });

  it("hears of the success, one time for each call", async () => {
    const after: Array<[boolean, number]> = [];
    const { transport } = scripted([["error"], [42]]);
    const client = new Client(transport).use(
      createRetryMiddleware({ retryDelay: ms(1), jitter: 0, onAfterRetry: (success, attempt) => void after.push([success, attempt]) }),
    );
    expect(await client.call(method, {})).toBe(42);
    expect(after).toEqual([[true, 1]]);
  });

  it("hears of the outcome of the last item when the reader stops a stream", async () => {
    for (const [script, expected] of [
      [[[1, 2, 3]], [true, 0]],
      [[["error"], [1, "error", 3]], [false, 1]],
    ] as const) {
      const after: Array<[boolean, number]> = [];
      const { transport } = scripted(script.map((attempt) => [...attempt]));
      const client = new Client({ transport, throwOnError: false }).use(
        createRetryMiddleware({ retryDelay: ms(1), jitter: 0, onAfterRetry: (success, attempt) => void after.push([success, attempt]) }),
      );
      let read = 0;
      for await (const _ of client.stream(method, {})) {
        if (++read === 2) break;
      }
      expect(after).toEqual([expected]);
    }
  });
});

/** A clock that runs each timer at once, and keeps the delay of each timer. A test can set its time. */
function instantClock() {
  let time = 0;
  const delays: number[] = [];
  const clock: Clock = {
    now: () => time,
    after(delay, run) {
      delays.push(delay);
      queueMicrotask(run);
      return () => undefined;
    },
  };
  return { clock, delays, setTime: (value: number) => (time = value) };
}

type Step = "fail" | "fatal" | "ok" | "abort" | "nothing";

/** A transport whose try number `n` (from 1) does `step(n)`. It keeps the id and the retry state of each try. */
function tries(step: (n: number) => Step) {
  const seen: Array<{ id: string; retry: unknown }> = [];
  const transport: Transport = {
    name: "tries",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      seen.push({ id: message.id, retry: structuredClone(message.metadata["retry"]) });
      const what = step(seen.length);
      if (what === "abort") throw Object.assign(new Error("stopped"), { name: "AbortError" });
      if (what === "fail") yield retryableError<TRes>(message.id);
      if (what === "fatal") {
        yield { id: message.id, status: { type: "error", code: "INVALID", message: "invalid", retryable: false }, metadata: {} } as ResponseItem<TRes>;
      }
      if (what === "ok") yield item(message.id, "done" as TRes);
    },
    close: async () => {},
  };
  return { transport, seen, count: () => seen.length };
}

const failThenOk = (failures: number) => (n: number): Step => (n <= failures ? "fail" : "ok");

describe("retry: the overrides of a call", () => {
  it("ignores an attempt count that is negative or not finite: the default count applies", async () => {
    for (const maxAttempts of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      const t = tries(() => "fail");
      const client = new Client({ transport: t.transport, throwOnError: false }).use(
        createRetryMiddleware({ retryDelay: ms(0), clock: instantClock().clock }),
      );
      await client.call(method, {}, { context: { retry: { maxAttempts } } });
      expect(t.count()).toBe(4);
    }
  });

  it("makes one try for an attempt count of 0 or 1", async () => {
    for (const maxAttempts of [0, 1]) {
      const t = tries(() => "fail");
      const client = new Client({ transport: t.transport, throwOnError: false }).use(
        createRetryMiddleware({ retryDelay: ms(0), clock: instantClock().clock }),
      );
      await client.call(method, {}, { context: { retry: { maxAttempts } } });
      expect(t.count()).toBe(1);
    }
  });

  it("takes the factor of the backoff from the call", async () => {
    const { clock, delays } = instantClock();
    const t = tries(failThenOk(2));
    const client = new Client(t.transport).use(createRetryMiddleware({ retryDelay: ms(10), jitter: 0, clock }));
    expect(await client.call(method, {}, { context: { retry: { backoffMultiplier: 3 } } })).toBe("done");
    expect(delays).toEqual([10, 30]);
  });

  it("takes the factor of the backoff from the options", async () => {
    const { clock, delays } = instantClock();
    const t = tries(failThenOk(3));
    const client = new Client(t.transport).use(createRetryMiddleware({ retryDelay: ms(10), backoffMultiplier: 3, jitter: 0, clock }));
    expect(await client.call(method, {})).toBe("done");
    expect(delays).toEqual([10, 30, 90]);
  });

  it("keeps the overrides of the call in the retry state of each try", async () => {
    const t = tries(failThenOk(1));
    const client = new Client(t.transport).use(createRetryMiddleware({ clock: instantClock().clock }));
    await client.call(method, {}, { context: { retry: { delay: ms(0), maxAttempts: 2 } } });
    expect(t.seen.map((step) => step.retry)).toEqual([
      { delay: ms(0), maxAttempts: 2, attempt: 0, idempotent: false },
      { delay: ms(0), maxAttempts: 2, attempt: 1, idempotent: false },
    ]);
  });

  it("writes the attempt count of the middleware into the retry state", async () => {
    const t = tries(() => "ok");
    const client = new Client(t.transport).use(createRetryMiddleware({ maxRetries: 3 }));
    await client.call(method, {});
    expect(t.seen[0]?.retry).toEqual({ attempt: 0, maxAttempts: 4, idempotent: false });
  });

  it("accepts null as the retry state of a call", async () => {
    const t = tries(failThenOk(1));
    const client = new Client(t.transport).use(createRetryMiddleware({ retryDelay: ms(0), clock: instantClock().clock }));
    expect(await client.call(method, {}, { metadata: { retry: null } })).toBe("done");
    expect(t.count()).toBe(2);
  });

  it("names the option or the override in the error of a delay that is not a duration", async () => {
    expect(() => createRetryMiddleware({ retryDelay: 500 as never })).toThrow(/^retryDelay must be a duration/);
    expect(() => createRetryMiddleware({ maxDelay: 500 as never })).toThrow(/^maxDelay must be a duration/);
    const client = new Client(tries(() => "ok").transport).use(createRetryMiddleware());
    await expect(client.call(method, {}, { context: { retry: { delay: 5 as never } } })).rejects.toThrow(/^retry\.delay must be a duration/);
    await expect(client.call(method, {}, { context: { retry: { maxDelay: 5 as never } } })).rejects.toThrow(/^retry\.maxDelay must be a duration/);
  });
});

describe("retry: the ids of the tries", () => {
  it("sends the first try with the id of the call, and each retry with its own id", async () => {
    const t = tries(failThenOk(2));
    const client = new Client(t.transport).use(createRetryMiddleware({ retryDelay: ms(0), clock: instantClock().clock }));
    await client.call(method, {});
    const [first, second, third] = t.seen.map((step) => step.id);
    expect(first).not.toMatch(/retry/);
    expect(second).toBe(`${first}.retry1`);
    expect(third).toBe(`${first}.retry2`);
  });
});

describe("retry: aborts", () => {
  it("makes no try when the signal aborted before the call", async () => {
    const t = tries(() => "ok");
    const client = new Client(t.transport).use(createRetryMiddleware());
    const controller = new AbortController();
    controller.abort();
    await expect(client.call(method, {}, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(t.count()).toBe(0);
  });

  it("stops at once when the signal aborts during the backoff, with the error of the try that ran", async () => {
    const clock = fakeClock();
    const t = tries(() => "fail");
    const client = new Client(t.transport).use(createRetryMiddleware({ retryDelay: seconds(1), jitter: 0, clock }));
    const controller = new AbortController();
    const call = client.call(method, {}, { signal: controller.signal }).catch((error: unknown) => error);
    for (let wait = 0; wait < 100 && clock.pending === 0; wait++) await new Promise((resolve) => setImmediate(resolve));
    expect(clock.pending).toBe(1);
    controller.abort();
    const error = await call;
    expect(error).toBeInstanceOf(ClientError);
    expect(error).toMatchObject({ code: "ABORTED", responseId: t.seen[0]?.id });
    expect(t.count()).toBe(1);
  });

  it("does not retry a thrown abort, also for an idempotent call that shouldRetry would retry", async () => {
    const t = tries(() => "abort");
    const client = new Client(t.transport).use(
      createRetryMiddleware({ retryDelay: ms(0), idempotent: true, shouldRetry: () => true, clock: instantClock().clock }),
    );
    await expect(client.call(method, {})).rejects.toMatchObject({ name: "AbortError" });
    expect(t.count()).toBe(1);
  });
});

describe("retry: the hooks", () => {
  it("calls onAfterRetry with the outcome and the attempt of the last try", async () => {
    for (const [step, expected] of [
      [failThenOk(1), [true, 1]],
      [(): Step => "fatal", [false, 0]],
    ] as const) {
      const after: Array<[boolean, number]> = [];
      const t = tries(step);
      const client = new Client({ transport: t.transport, throwOnError: false }).use(
        createRetryMiddleware({ retryDelay: ms(0), clock: instantClock().clock, onAfterRetry: (success, attempt) => void after.push([success, attempt]) }),
      );
      await client.call(method, {});
      expect(after).toEqual([expected]);
    }
  });

  it("calls onAfterRetry with false after a stream that gave no item", async () => {
    const after: Array<[boolean, number]> = [];
    const t = tries(() => "nothing");
    const client = new Client(t.transport).use(createRetryMiddleware({ onAfterRetry: (success, attempt) => void after.push([success, attempt]) }));
    const items: unknown[] = [];
    for await (const value of client.stream(method, {})) items.push(value);
    expect(items).toEqual([]);
    expect(after).toEqual([[false, 0]]);
  });

  it("gives the error to the caller when onBeforeRetry refuses the retry", async () => {
    const before: Array<[string, number]> = [];
    const after: Array<[boolean, number]> = [];
    const t = tries(() => "fail");
    const client = new Client(t.transport).use(
      createRetryMiddleware({
        retryDelay: ms(0),
        clock: instantClock().clock,
        onBeforeRetry: (failed, attempt) => {
          before.push([failed.status.type === "error" ? failed.status.code : "success", attempt]);
          return { shouldRetry: false };
        },
        onAfterRetry: (success, attempt) => void after.push([success, attempt]),
      }),
    );
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(t.count()).toBe(1);
    expect(before).toEqual([["UNAVAILABLE", 0]]);
    expect(after).toEqual([[false, 0]]);
  });

  it("gives the error to the caller when onBeforeRetry refuses the retry and onAfterRetry is absent", async () => {
    const t = tries(() => "fail");
    const client = new Client(t.transport).use(createRetryMiddleware({ retryDelay: ms(0), onBeforeRetry: () => ({ shouldRetry: false }) }));
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(t.count()).toBe(1);
  });

  it("waits the delay of onBeforeRetry, or the backoff when the hook gives none", async () => {
    for (const [hookDelay, expected] of [
      [7, 7],
      [undefined, 1000],
    ] as const) {
      const { clock, delays } = instantClock();
      const t = tries(failThenOk(1));
      const client = new Client(t.transport).use(
        createRetryMiddleware({
          retryDelay: seconds(1),
          jitter: 0,
          clock,
          onBeforeRetry: () => (hookDelay === undefined ? { shouldRetry: true } : { shouldRetry: true, delayMs: hookDelay }),
        }),
      );
      expect(await client.call(method, {})).toBe("done");
      expect(delays).toEqual([expected]);
      expect(t.count()).toBe(2);
    }
  });
});

describe("retry: the budget", () => {
  /** The number of tries of each call, for calls that fail with a retryable error. */
  async function triesOfCalls(client: Client, t: ReturnType<typeof tries>, calls: number): Promise<number[]> {
    const out: number[] = [];
    for (let call = 0; call < calls; call++) {
      const before = t.count();
      await client.call(method, {});
      out.push(t.count() - before);
    }
    return out;
  }

  it("starts full: a burst of failing calls gets its retries", async () => {
    const t = tries(() => "fail");
    const client = new Client({ transport: t.transport, throwOnError: false }).use(
      createRetryMiddleware({ maxRetries: 1, retryDelay: ms(0), clock: instantClock().clock, budget: { ratio: 0.2, minPerSecond: 0 } }),
    );
    expect(await triesOfCalls(client, t, 10)).toEqual(Array(10).fill(2));
  });

  it("refuses no retry when it is off", async () => {
    const t = tries(() => "fail");
    const client = new Client({ transport: t.transport, throwOnError: false }).use(
      createRetryMiddleware({ maxRetries: 1, retryDelay: ms(0), clock: instantClock().clock, budget: false }),
    );
    expect(await triesOfCalls(client, t, 60)).toEqual(Array(60).fill(2));
  });

  it("gets the ratio of a retry from each call, also from a call that succeeds", async () => {
    let failing = true;
    const t = tries(() => (failing ? "fail" : "ok"));
    const client = new Client({ transport: t.transport, throwOnError: false }).use(
      createRetryMiddleware({ maxRetries: 1, retryDelay: ms(0), clock: instantClock().clock, budget: { ratio: 0.5, minPerSecond: 0 } }),
    );
    // Empty the budget: each failing call takes one retry and gives back half of one
    let refusedAfter = 0;
    for (let call = 1; call <= 1000 && refusedAfter === 0; call++) {
      if ((await triesOfCalls(client, t, 1))[0] === 1) refusedAfter = call;
    }
    expect(refusedAfter).toBe(100);
    // Two calls that succeed give one retry back
    failing = false;
    await client.call(method, {});
    await client.call(method, {});
    failing = true;
    expect(await triesOfCalls(client, t, 1)).toEqual([2]);
  });

  it("allows minPerSecond retries in each second after the budget is empty", async () => {
    const after: Array<[boolean, number]> = [];
    const { clock, setTime } = instantClock();
    const t = tries(() => "fail");
    const client = new Client({ transport: t.transport, throwOnError: false }).use(
      createRetryMiddleware({
        maxRetries: 1,
        retryDelay: ms(0),
        clock,
        budget: { ratio: 0, minPerSecond: 1 },
        onAfterRetry: (success, attempt) => void after.push([success, attempt]),
      }),
    );
    // The budget has one retry, and the second of the clock one more
    expect(await triesOfCalls(client, t, 3)).toEqual([2, 2, 1]);
    expect(after[2]).toEqual([false, 0]);
    setTime(999);
    expect(await triesOfCalls(client, t, 1)).toEqual([1]);
    setTime(1_000);
    expect(await triesOfCalls(client, t, 2)).toEqual([2, 1]);
  });
});
