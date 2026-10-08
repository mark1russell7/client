/**
 * The retry middleware with streams (regression: BUGS-2026-07 M2: it collected the whole
 * stream before it yielded anything, so a stream that does not end never gave an item).
 */

import { describe, it, expect } from "vitest";
import { Client } from "../client.js";
import { createRetryMiddleware } from "./retry.js";
import type { Message, ResponseItem, Transport } from "../types.js";

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
    const client = new Client(endless).use(createRetryMiddleware({ retryDelay: 1 }));
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
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    const seen: number[] = [];
    for await (const n of client.stream<unknown, number>(method, {})) seen.push(n);
    expect(seen).toEqual([1, 2, 3]);
    expect(calls()).toBe(3);
  });

  it("does not retry an error after the first item: a retry would repeat items", async () => {
    const { transport, calls } = scripted([[1, 2, "error"], [1, 2, 3]]);
    const client = new Client({ transport, throwOnError: false }).use(createRetryMiddleware({ retryDelay: 1 }));
    const seen: unknown[] = [];
    for await (const n of client.stream<unknown, unknown>(method, {})) seen.push(n);
    expect(seen).toEqual([1, 2, null]);
    expect(calls()).toBe(1);
  });

  it("gives the error after the last attempt", async () => {
    const { transport, calls } = scripted([["error"]]);
    const client = new Client(transport).use(createRetryMiddleware({ maxRetries: 2, retryDelay: 1, jitter: 0 }));
    await expect(client.call(method, {})).rejects.toThrow("try again");
    expect(calls()).toBe(3);
  });

  it("keeps the request/response behavior: call() retries until success", async () => {
    const { transport, calls } = scripted([["error"], [42]]);
    const client = new Client(transport).use(createRetryMiddleware({ retryDelay: 1, jitter: 0 }));
    expect(await client.call(method, {})).toBe(42);
    expect(calls()).toBe(2);
  });
});
