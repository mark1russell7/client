/**
 * The rules of the cache (roadmap R13): one request for calls with the same key at the same
 * time, a write deletes the entries that it makes old, and a response whose key changed during
 * the call (an auth layer inside the cache) is not stored.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "../client.js";
import { createCacheMiddleware, invalidateCache, type CacheStats } from "./cache.js";
import type { ClientContext, ClientMiddleware, ClientRunner, Message, Method, ResponseItem, Transport } from "../types.js";
import type { Effects } from "../../procedures/types.js";
import { minutes, ms } from "../../duration.js";

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const key = (method: Method): string => `${method.service}.${method.operation}`;

function errorItem(id: string): ResponseItem<null> {
  return { id, status: { type: "error", code: "FAILED", message: "failed", retryable: false }, payload: null, metadata: {} };
}

/**
 * A transport that answers each call with its number. The methods of `failing` answer with an
 * error. After `hold()`, each new call waits until the test lets it go.
 */
function scripted() {
  const log: string[] = [];
  const failing = new Set<string>();
  let gate: Promise<void> | undefined;
  let payload = (n: number): unknown => n;
  const transport: Transport = {
    name: "scripted",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      log.push(key(message.method));
      const n = log.length;
      const fail = failing.has(key(message.method));
      if (gate) await gate;
      yield (fail ? errorItem(message.id) : { id: message.id, status: { type: "success", code: 200 }, payload: payload(n), metadata: {} }) as ResponseItem<TRes>;
    },
    close: async () => {},
  };
  return {
    transport,
    log,
    failing,
    calls: () => log.length,
    /** This function makes the next calls wait, and gives the function that lets them go. */
    hold(): () => void {
      let open: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (open = resolve));
      gate = held;
      return () => {
        if (gate === held) gate = undefined;
        open();
      };
    },
    /** After this function, the new calls do not wait. The calls that wait now still wait. */
    holdNoMore(): void {
      gate = undefined;
    },
    answerWith(make: (n: number) => unknown): void {
      payload = make;
    },
  };
}

/** A middleware that keeps the `cache` state of each call after the inner middlewares ran. */
function hits(seen: Array<boolean | undefined>): ClientMiddleware {
  return (<TReq, TRes>(next: ClientRunner<TReq, TRes>) =>
    async function* (context: ClientContext<TReq>) {
      yield* next(context);
      seen.push((context.message.metadata["cache"] as { hit?: boolean } | undefined)?.hit);
    }) as never;
}

/** The time of the next tasks: the microtasks of the calls in flight run before it. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("the cache: what it stores", () => {
  it("does not store an error response", async () => {
    const t = scripted();
    t.failing.add("users.get");
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    await expect(client.call(read, {})).rejects.toThrow("failed");
    t.failing.clear();
    expect(await client.call(read, {})).toBe(2);
    expect(await client.call(read, {})).toBe(2);
    expect(t.calls()).toBe(2);
  });

  it("gives a response that it cannot copy, and does not store it", async () => {
    const t = scripted();
    t.answerWith((n) => ({ n, run: () => n }));
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    const first = await client.call<unknown, { run: () => number }>(read, {});
    expect(first.run()).toBe(1);
    const second = await client.call<unknown, { run: () => number }>(read, {});
    expect(second.run()).toBe(2);
  });

  it("ends an entry at its time to live: at that time, the call goes to the transport", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"], ttl: ms(10) }));
    expect(await client.call(read, {})).toBe(1);
    vi.setSystemTime(1_009);
    expect(await client.call(read, {})).toBe(1);
    vi.setSystemTime(1_010);
    expect(await client.call(read, {})).toBe(2);
  });

  it("deletes an expired entry, also when the new response is not stored", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    const t = scripted();
    const cache = createCacheMiddleware({ methods: ["users.get"], ttl: ms(10) });
    const client = new Client({ transport: t.transport, throwOnError: false }).use(cache);
    await client.call(read, {});
    vi.setSystemTime(1_020);
    t.failing.add("users.get");
    await client.call(read, {});
    expect(invalidateCache(cache)).toBe(0);
  });
});

describe("the cache: the overrides of a call", () => {
  it("reads the stored response for a call with overrides and no refresh", async () => {
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    const withTtl = client.withContext({ cache: { ttl: minutes(1) } });
    expect(await withTtl.call(read, {})).toBe(1);
    expect(await withTtl.call(read, {})).toBe(1);
    expect(await client.withContext({ cache: { refresh: false, bypass: false } }).call(read, {})).toBe(1);
    expect(t.calls()).toBe(1);
  });

  it("does not keep a response with a time to live of zero", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"], ttl: minutes(1) }));
    const once = client.withContext({ cache: { ttl: ms(0) } });
    expect(await once.call(read, {})).toBe(1);
    expect(await client.call(read, {})).toBe(2);
  });

  it("ignores a negative time to live: the time to live of the middleware applies", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"], ttl: minutes(1) }));
    expect(await client.withContext({ cache: { ttl: ms(-5) } }).call(read, {})).toBe(1);
    vi.setSystemTime(1_000 + 59_000);
    expect(await client.call(read, {})).toBe(1);
  });

  it("caches as usual when the cache key of the metadata is null", async () => {
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    expect(await client.call(read, {}, { metadata: { cache: null } })).toBe(1);
    expect(await client.call(read, {}, { metadata: { cache: null } })).toBe(1);
  });

  it("writes hit: false for a call that bypasses the cache", async () => {
    const seen: Array<boolean | undefined> = [];
    const t = scripted();
    const client = new Client(t.transport).use(hits(seen)).use(createCacheMiddleware({ methods: ["users.get"] }));
    await client.call(read, {});
    await client.withContext({ cache: { bypass: true } }).call(read, {});
    expect(seen).toEqual([false, false]);
  });
});

describe("the cache: calls in flight", () => {
  it("lets the second caller make its own request when the first call failed", async () => {
    const t = scripted();
    t.failing.add("users.get");
    const release = t.hold();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    const first = client.call(read, {});
    const firstOutcome = first.catch((error: unknown) => error);
    await tick();
    const second = client.call(read, {});
    await tick();
    t.failing.clear();
    release();
    expect(await firstOutcome).toBeInstanceOf(Error);
    expect(await second).toBe(2);
  });

  it("writes hit: true for the caller that gets the response of the call in flight", async () => {
    const seen: Array<boolean | undefined> = [];
    const t = scripted();
    const release = t.hold();
    const client = new Client(t.transport).use(hits(seen)).use(createCacheMiddleware({ methods: ["users.get"] }));
    const both = Promise.all([client.call(read, {}), client.call(read, {})]);
    await tick();
    release();
    expect(await both).toEqual([1, 1]);
    expect([...seen].sort()).toEqual([false, true]);
  });

  it("keeps the call in flight shared when a refresh of the same key ends first", async () => {
    const t = scripted();
    const release = t.hold();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods: ["users.get"] }));
    const first = client.call(read, {});
    await tick();
    // The refresh does not wait, and it fails: it stores nothing
    t.holdNoMore();
    t.failing.add("users.get");
    const refresh = client.withContext({ cache: { refresh: true } }).call(read, {});
    await expect(refresh).rejects.toThrow("failed");
    t.failing.clear();
    // A call after the refresh waits for the first call, as the first call is still in flight
    const third = client.call(read, {});
    await tick();
    release();
    expect(await first).toBe(1);
    expect(await third).toBe(1);
    expect(t.calls()).toBe(2);
  });
});

describe("the cache: invalidation", () => {
  const known: Record<string, Effects> = {
    "users.get": { reads: ["users"], writes: [] },
    "users.count": { reads: ["users"], writes: [] },
    "users.rename": { reads: ["users"], writes: ["users"] },
    "dash.get": { reads: ["users", "orders"], writes: [] },
    "orders.list": { reads: ["orders"], writes: [] },
  };
  // The effects of misc.get and of x.ping are unknown
  const effectsOfKnown = (method: Method): Effects | undefined => known[key(method)];
  const methods = ["users.get", "dash.get", "misc.get", "orders.list"];
  const dash = { service: "dash", operation: "get" };
  const misc = { service: "misc", operation: "get" };
  const readAll = async (client: Client): Promise<void> => {
    for (const method of [read, dash, misc, other]) await client.call(method, {});
  };

  it("a call that writes nothing deletes nothing, also the entries whose reads are unknown", async () => {
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods, effects: effectsOfKnown }));
    await readAll(client);
    expect(t.calls()).toBe(4);
    await client.call({ service: "users", operation: "count" }, {});
    await client.call({ service: "x", operation: "ping" }, {});
    await readAll(client);
    expect(t.calls()).toBe(6);
  });

  it("a write deletes each entry that reads one of its resources, and each entry whose reads are unknown", async () => {
    const t = scripted();
    const client = new Client(t.transport).use(createCacheMiddleware({ methods, effects: effectsOfKnown }));
    await readAll(client);
    await client.call(write, {});
    await readAll(client);
    // users.get, dash.get and misc.get went again, orders.list stayed in the cache
    expect(t.log.slice(5)).toEqual(["users.get", "dash.get", "misc.get"]);
  });

  it("a write that fails deletes nothing", async () => {
    const t = scripted();
    t.failing.add("users.rename");
    const client = new Client({ transport: t.transport, throwOnError: false }).use(createCacheMiddleware({ methods, effects: effectsOfKnown }));
    await client.call(read, {});
    await client.call(write, {});
    await client.call(read, {});
    expect(t.log).toEqual(["users.get", "users.rename"]);
  });

  it("invalidateCache of all the entries makes the next call go to the transport", async () => {
    const t = scripted();
    const cache = createCacheMiddleware({ methods: ["users.get"] });
    const client = new Client(t.transport).use(cache);
    await client.call(read, {});
    expect(invalidateCache(cache)).toBe(1);
    expect(await client.call(read, {})).toBe(2);
  });

  it("invalidateCache of an object that is not a cache middleware deletes nothing", () => {
    expect(invalidateCache({})).toBe(0);
    expect(invalidateCache(createCacheMiddleware({ methods: [] }), () => true)).toBe(0);
  });
});

describe("the cache: statistics and options", () => {
  it("reports the hits, the misses, the size and the evictions at each interval", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const stats: CacheStats[] = [];
    const t = scripted();
    const cache = createCacheMiddleware({ methods: ["users.get"], capacity: 1, statsInterval: ms(1_000), onStats: (s) => stats.push(s) });
    const client = new Client(t.transport).use(cache);
    vi.advanceTimersByTime(1_000);
    expect(stats).toEqual([{ hits: 0, misses: 0, size: 0, evictions: 0, hitRate: 0 }]);
    await client.call(read, { id: 1 });
    await client.call(read, { id: 1 });
    // The capacity is 1: this entry takes the place of the first one
    await client.call(read, { id: 2 });
    vi.advanceTimersByTime(999);
    expect(stats).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(stats[1]).toEqual({ hits: 1, misses: 2, size: 1, evictions: 1, hitRate: 33.33 });
  });

  it("counts the response of a call in flight as a hit", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const stats: CacheStats[] = [];
    const t = scripted();
    const release = t.hold();
    const cache = createCacheMiddleware({ methods: ["users.get"], statsInterval: ms(1_000), onStats: (s) => stats.push(s) });
    const client = new Client(t.transport).use(cache);
    const both = Promise.all([client.call(read, {}), client.call(read, {})]);
    await tick();
    release();
    await both;
    vi.advanceTimersByTime(1_000);
    expect(stats[0]).toMatchObject({ hits: 1, misses: 1, hitRate: 50 });
  });

  it("starts no timer without onStats", () => {
    vi.useFakeTimers();
    createCacheMiddleware({ methods: ["users.get"], statsInterval: ms(10) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts its statistics on a platform whose timers are numbers (a browser)", () => {
    vi.stubGlobal("setInterval", () => 7);
    expect(() => createCacheMiddleware({ methods: ["users.get"], onStats: () => undefined })).not.toThrow();
  });

  it("names the option in the error of a time that is not a duration", () => {
    expect(() => createCacheMiddleware({ methods: [], ttl: 5 as never })).toThrow(/^ttl must be a duration/);
    expect(() => createCacheMiddleware({ methods: [], statsInterval: 5 as never })).toThrow(/^statsInterval must be a duration/);
  });
});
