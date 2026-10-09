/**
 * The route API: prototype keys (deep dive CORE-6), the context of nested calls (CORE-10), the
 * override keys and the leaves after a validation error (CORE-14).
 */

import { describe, it, expect } from "vitest";
import { Client } from "./client.js";
import { buildResponse, flattenRoute, mergeRoutes, createRoute } from "./call-types.js";
import { filterRouteByPattern } from "./route-resolver.js";
import type { Message, ResponseItem, Transport } from "./types.js";
import { createRetryMiddleware } from "./middleware/retry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import type { ProcedureContext } from "../procedures/types.js";

const noTransport = { name: "none", send: async function* () {}, close: async () => {} } as unknown as Transport;

/** A route that JSON.parse made: "__proto__" is an own key there. */
const hostileRoute = () => JSON.parse('{"__proto__": {"polluted": {"x": 1}}}');

describe("route keys (deep dive CORE-6)", () => {
  it("buildResponse rejects a prototype key and does not change Object.prototype", () => {
    expect(() => buildResponse([[["__proto__", "polluted"], { success: true }]])).toThrow(/Invalid route key/);
    expect(() => buildResponse([[["a", "constructor"], { success: true }]])).toThrow(/Invalid route key/);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("flattenRoute, mergeRoutes, createRoute and filterRouteByPattern reject prototype keys", () => {
    expect(() => flattenRoute(hostileRoute())).toThrow(/Invalid route key/);
    expect(() => mergeRoutes({ a: { b: {} } }, hostileRoute())).toThrow(/Invalid route key/);
    expect(() => createRoute(["prototype", "x"], {})).toThrow(/Invalid route key/);
    expect(() => filterRouteByPattern(hostileRoute(), ["**"])).toThrow(/Invalid route key/);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("route() rejects a hostile route, and Object.prototype stays clean", async () => {
    const client = new Client(noTransport).useRegistry(new ProcedureRegistry());
    await expect(client.route({ route: hostileRoute() })).rejects.toThrow(/Invalid route key/);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("buildResponse keeps a key that only an inherited property has", () => {
    // "toString" is on Object.prototype: `in` saw it and descended into the function
    const response = buildResponse([
      [["toString", "a"], { success: true, data: 1 }],
      [["toString", "b"], { success: true, data: 2 }],
    ]) as unknown as { toString: Record<string, { data: number }> };
    expect(response.toString.a.data).toBe(1);
    expect(response.toString.b.data).toBe(2);
  });
});

describe("nested calls keep the caller's signal and metadata (deep dive CORE-10)", () => {
  function registry(seen: { inner?: ProcedureContext }): ProcedureRegistry {
    const reg = new ProcedureRegistry();
    reg.register(
      defineProcedure({
        path: ["test", "outer"],
        input: outputSchema<Record<string, never>>(),
        output: outputSchema<unknown>(),
        handler: async (_input: unknown, ctx: ProcedureContext) => ctx.client.call(["test", "inner"], {}),
      })
    );
    reg.register(
      defineProcedure({
        path: ["test", "inner"],
        input: outputSchema<Record<string, never>>(),
        output: outputSchema<unknown>(),
        handler: (_input: unknown, ctx: ProcedureContext) => {
          seen.inner = ctx;
          return new Promise((resolve) => {
            if (ctx.signal?.aborted) resolve("aborted");
            ctx.signal?.addEventListener("abort", () => resolve("aborted"));
            setTimeout(() => resolve("timed out"), 200);
          });
        },
      })
    );
    return reg;
  }

  it("aborting a route() aborts the nested call", async () => {
    const seen: { inner?: ProcedureContext } = {};
    const client = new Client(noTransport).useRegistry(registry(seen));
    const controller = new AbortController();

    const pending = client.route({ route: { test: { outer: {} } }, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    const response = (await pending) as unknown as { test: { outer: { data: unknown } } };

    expect(response.test.outer.data).toBe("aborted");
  });

  it("the nested call gets the metadata, without the internal override key", async () => {
    const seen: { inner?: ProcedureContext } = {};
    const client = new Client(noTransport).useRegistry(registry(seen)).withContext({ auth: { token: "t1" } } as never);
    const controller = new AbortController();
    const pending = client.route({
      route: { test: { outer: {} } },
      middlewares: { retry: { attempts: 2 } },
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await pending;

    expect(seen.inner?.metadata["auth"]).toEqual({ token: "t1" });
    expect(seen.inner?.metadata).not.toHaveProperty("__middlewareOverrides");
  });
});

describe("route() overrides and validation errors (deep dive CORE-14)", () => {
  it("maps retry.attempts to the key that the retry middleware reads", async () => {
    let sends = 0;
    const failing: Transport = {
      name: "failing",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        sends++;
        yield {
          id: message.id,
          status: { type: "error", code: "UNAVAILABLE", message: "down", retryable: true },
          payload: undefined as TRes,
          metadata: {},
        } as ResponseItem<TRes>;
      },
      close: async () => {},
    } as Transport;
    const reg = new ProcedureRegistry();
    // A remote procedure: no handler, so the call goes through the middleware to the transport
    reg.register({ path: ["remote", "op"], input: outputSchema(), output: outputSchema(), metadata: {} });
    const client = new Client({ transport: failing }).use(createRetryMiddleware({ retryDelay: 0, jitter: 0, maxRetries: 0 })).useRegistry(reg);

    await client.route({ route: { remote: { op: {} } }, middlewares: { retry: { attempts: 2 } } });

    expect(sends).toBe(3);
  });

  it("maps timeout.ms to timeout.overall", async () => {
    const reg = new ProcedureRegistry();
    let metadata: Record<string, unknown> = {};
    reg.register(
      defineProcedure({
        path: ["test", "meta"],
        input: outputSchema<Record<string, never>>(),
        output: outputSchema<unknown>(),
        handler: async (_input: unknown, ctx: ProcedureContext) => {
          metadata = ctx.metadata;
          return null;
        },
      })
    );
    const client = new Client(noTransport).useRegistry(reg);
    await client.route({ route: { test: { meta: {} } }, middlewares: { timeout: { ms: 1234 } } });
    expect(metadata["timeout"]).toEqual({ overall: 1234 });
  });

  it("lists every leaf after a validation error", async () => {
    const reg = new ProcedureRegistry();
    const strict = {
      parse: (v: unknown) => v,
      safeParse: (v: unknown) =>
        typeof (v as { n?: unknown }).n === "number"
          ? { success: true as const, data: v }
          : { success: false as const, error: { message: "n must be a number", errors: [] } },
    };
    for (const name of ["a", "b", "c"]) {
      reg.register(defineProcedure({ path: ["test", name], input: strict as never, output: outputSchema(), handler: async () => name }));
    }
    const client = new Client(noTransport).useRegistry(reg);

    const response = (await client.route({
      route: { test: { a: { n: 1 }, b: { n: "x" }, c: { n: 3 } } },
    })) as unknown as { test: Record<string, { error?: { code: string } }> };

    expect(response.test["b"]?.error?.code).toBe("VALIDATION_ERROR");
    expect(response.test["a"]?.error?.code).toBe("SKIPPED");
    expect(response.test["c"]?.error?.code).toBe("SKIPPED");

    const streamed = client.routeStream({ route: { test: { a: { n: 1 }, b: { n: "x" }, c: { n: 3 } } } });
    const codes: Record<string, string | undefined> = {};
    for await (const { path, result } of streamed.results) codes[path.join(".")] = result.error?.code;
    expect(codes).toEqual({ "test.a": "SKIPPED", "test.b": "VALIDATION_ERROR", "test.c": "SKIPPED" });
  });
});
