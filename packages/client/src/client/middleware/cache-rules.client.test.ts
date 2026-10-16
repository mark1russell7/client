/**
 * The rules of the cache (roadmap R13): one request for calls with the same key at the same
 * time, a write deletes the entries that it makes old, and a response whose key changed during
 * the call (an auth layer inside the cache) is not stored.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../client.js";
import { createCacheMiddleware, invalidateCache } from "./cache.js";
import type { ClientContext, ClientMiddleware, ClientRunner, Message, Method, ResponseItem, Transport } from "../types.js";
import type { Effects } from "../../procedures/types.js";

const read = { service: "users", operation: "get" };
const write = { service: "users", operation: "rename" };
const other = { service: "orders", operation: "list" };

function counting(delayMs = 0) {
  let calls = 0;
  const transport: Transport = {
    name: "counting",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      calls++;
      const n = calls;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      yield { id: message.id, status: { type: "success", code: 200 }, payload: n as TRes, metadata: {} };
    },
    close: async () => {},
  };
  return { transport, calls: () => calls };
}

const effects: Record<string, Effects> = {
  "users.get": { reads: ["users"], writes: [] },
  "users.rename": { reads: ["users"], writes: ["users"] },
  "orders.list": { reads: ["orders"], writes: [] },
};
const effectsOf = (method: Method): Effects | undefined => effects[`${method.service}.${method.operation}`];

describe("the cache (R13)", () => {
  it("makes one request for two calls with the same key at the same time", async () => {
    const { transport, calls } = counting(30);
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    const [a, b] = await Promise.all([client.call(read, { id: 1 }), client.call(read, { id: 1 })]);
    expect(calls()).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("a write deletes the entries of the methods that read its resources", async () => {
    const { transport, calls } = counting();
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["users.get", "orders.list"], effects: effectsOf }));
    await client.call(read, { id: 1 });
    await client.call(other, {});
    await client.call(read, { id: 1 });
    await client.call(other, {});
    expect(calls()).toBe(2);
    await client.call(write, { id: 1 });
    await client.call(read, { id: 1 });
    await client.call(other, {});
    // The read of users went again, the read of orders stayed in the cache
    expect(calls()).toBe(4);
  });

  it("invalidateCache deletes the entries of a method, or all", async () => {
    const { transport, calls } = counting();
    const cache = createCacheMiddleware({ methods: ["users.get", "orders.list"] });
    const client = new Client(transport).use(cache);
    await client.call(read, {});
    await client.call(other, {});
    expect(invalidateCache(cache, (method) => method.service === "users")).toBe(1);
    await client.call(read, {});
    await client.call(other, {});
    expect(calls()).toBe(3);
    expect(invalidateCache(cache)).toBe(2);
  });

  it("does not store a response when an inner layer changed the key metadata (an auth inside the cache)", async () => {
    const { transport, calls } = counting();
    let user = "alice";
    // An auth layer inside the cache: it adds the token after the cache made its key
    const auth: ClientMiddleware = <TReq, TRes>(next: ClientRunner<TReq, TRes>) =>
      async function* (context: ClientContext<TReq>) {
        context.message.metadata["auth"] = { token: user };
        yield* next(context);
      };
    const client = new Client(transport).use(createCacheMiddleware({ methods: ["users.get"] })).use(auth as never);
    expect(await client.call(read, {})).toBe(1);
    user = "bob";
    // Bob does not get the response of Alice
    expect(await client.call(read, {})).toBe(2);
    expect(calls()).toBe(2);
  });
});
