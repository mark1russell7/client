/**
 * Interceptors around each invocation (architecture review, roadmap 1.2).
 *
 * The client middlewares wrap only `transport.send`, so an MCP tool call and the nested calls of
 * a procedure got no timeout and no tracing. An interceptor runs around every invocation of
 * `invokeProcedure()`, and the nested calls inherit the chain.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { invokePath, outputValue, outputItems, InvocationError, type Interceptor, type Invocation } from "./invoke.js";
import { timeoutInterceptor, tracingInterceptor, metricsInterceptor, type InvocationSpan } from "./interceptors.js";
import type { AnyProcedure, ProcedureContext } from "./types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { Client } from "../client/client.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { ms } from "../duration.js";

const any = outputSchema<unknown>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(): { registry: ProcedureRegistry; seen: { aborted: boolean } } {
  const registry = new ProcedureRegistry();
  const seen = { aborted: false };
  const add = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown) =>
    registry.register(defineProcedure({ path, input: any, output: any, handler: handler as never }) as AnyProcedure);
  add(["t", "leaf"], (input: { n?: number }) => (input.n ?? 0) + 1);
  add(["t", "outer"], async (_input, ctx) => (await ctx.client.call<unknown, number>(["t", "leaf"], { n: 1 })) * 10);
  add(["t", "fail"], () => {
    throw new Error("broken");
  });
  add(["t", "hang"], (_input, ctx) => {
    return new Promise((resolve) => {
      ctx.signal?.addEventListener("abort", () => {
        seen.aborted = true;
        resolve("late");
      });
    });
  });
  add(["t", "deaf"], () => new Promise((resolve) => setTimeout(() => resolve("too late"), 2000)));
  add(["t", "stream"], async function* () {
    yield 1;
    await sleep(20);
    yield 2;
  });
  add(["t", "slowStream"], async function* () {
    yield 1;
    await sleep(2000);
    yield 2;
  });
  add(["t", "signal"], (_input, ctx) => (ctx.signal ? "has signal" : "no signal"));
  return { registry, seen };
}

describe("the interceptor chain", () => {
  it("runs around a call and each nested call, with the parent and the depth", async () => {
    const { registry } = setup();
    const log: string[] = [];
    const record: Interceptor = async (invocation, next) => {
      log.push(`start ${invocation.path.join(".")} depth ${invocation.depth} parent ${invocation.parent?.path.join(".") ?? "-"}`);
      const output = await next();
      log.push(`end ${invocation.path.join(".")}`);
      return output;
    };
    const value = await outputValue(await invokePath(["t", "outer"], {}, { registry, interceptors: [record] }));
    expect(value).toBe(20);
    expect(log).toEqual(["start t.outer depth 0 parent -", "start t.leaf depth 1 parent t.outer", "end t.leaf", "end t.outer"]);
  });

  it("runs the interceptors in order: the first is the outermost", async () => {
    const { registry } = setup();
    const log: string[] = [];
    const named = (name: string): Interceptor => async (_invocation, next) => {
      log.push(`${name} in`);
      const output = await next();
      log.push(`${name} out`);
      return output;
    };
    await invokePath(["t", "leaf"], {}, { registry, interceptors: [named("a"), named("b")] });
    expect(log).toEqual(["a in", "b in", "b out", "a out"]);
  });

  it("gives the handler and the nested calls the signal of next({ signal })", async () => {
    const { registry } = setup();
    const controller = new AbortController();
    const withSignal: Interceptor = (_invocation, next) => next({ signal: controller.signal });
    const output = await invokePath(["t", "signal"], {}, { registry, interceptors: [withSignal] });
    expect(await outputValue(output)).toBe("has signal");
  });

  it("can refuse a call: the handler does not run", async () => {
    const { registry } = setup();
    const deny: Interceptor = (invocation) => Promise.reject(new Error(`denied ${invocation.path.join(".")}`));
    await expect(invokePath(["t", "leaf"], {}, { registry, interceptors: [deny] })).rejects.toThrow("denied t.leaf");
  });
});

describe("timeoutInterceptor", () => {
  it("ends a call that runs too long with TIMEOUT, and aborts the handler's signal", async () => {
    const { registry, seen } = setup();
    const call = invokePath(["t", "hang"], {}, { registry, interceptors: [timeoutInterceptor({ limit: ms(50) })] });
    await expect(call).rejects.toBeInstanceOf(InvocationError);
    await expect(call).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(seen.aborted).toBe(true);
  });

  it("ends a call whose handler ignores the signal", async () => {
    const { registry } = setup();
    const started = Date.now();
    await expect(invokePath(["t", "deaf"], {}, { registry, interceptors: [timeoutInterceptor({ limit: ms(50) })] })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("covers a whole stream", async () => {
    const { registry } = setup();
    const output = await invokePath(["t", "slowStream"], {}, { registry, interceptors: [timeoutInterceptor({ limit: ms(100) })] });
    const items: unknown[] = [];
    await expect(
      (async () => {
        for await (const item of outputItems(output)) items.push(item);
      })(),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(items).toEqual([1]);
  });

  it("lets a call that ends in time pass, a stream too", async () => {
    const { registry } = setup();
    const interceptors = [timeoutInterceptor({ limit: ms(1000) })];
    expect(await outputValue(await invokePath(["t", "outer"], {}, { registry, interceptors }))).toBe(20);
    const items: unknown[] = [];
    for await (const item of outputItems(await invokePath(["t", "stream"], {}, { registry, interceptors }))) items.push(item);
    expect(items).toEqual([1, 2]);
  });

  it("limits only the top-level call by default: a nested call shares its parent's signal", async () => {
    const { registry } = setup();
    const limited: string[] = [];
    const interceptor = timeoutInterceptor({ limit: ms(1000), onLimit: (invocation: Invocation) => limited.push(invocation.path.join(".")) });
    await invokePath(["t", "outer"], {}, { registry, interceptors: [interceptor] });
    expect(limited).toEqual(["t.outer"]);
  });
});

describe("tracingInterceptor", () => {
  it("gives a span for each call, with the parent id, the trace id and the status", async () => {
    const { registry } = setup();
    const spans: InvocationSpan[] = [];
    const interceptors = [tracingInterceptor({ onSpan: (span) => spans.push(span) })];
    await invokePath(["t", "outer"], {}, { registry, interceptors });
    await expect(invokePath(["t", "fail"], {}, { registry, interceptors })).rejects.toThrow("broken");

    const [leaf, outer, fail] = spans;
    expect(leaf?.key).toBe("t.leaf");
    expect(outer?.key).toBe("t.outer");
    expect(leaf?.parentId).toBe(outer?.id);
    expect(leaf?.traceId).toBe(outer?.traceId);
    expect(outer?.parentId).toBeUndefined();
    expect(outer?.status).toBe("ok");
    expect(fail?.status).toBe("error");
    expect(fail?.error).toBe("broken");
    expect(fail?.traceId).not.toBe(outer?.traceId);
    expect(typeof outer?.durationMs).toBe("number");
  });

  it("ends the span of a stream when the stream ends, with the count of items", async () => {
    const { registry } = setup();
    const spans: InvocationSpan[] = [];
    const output = await invokePath(["t", "stream"], {}, { registry, interceptors: [tracingInterceptor({ onSpan: (span) => spans.push(span) })] });
    expect(spans).toEqual([]);
    for await (const _item of outputItems(output)) {
      // read every item
    }
    expect(spans[0]).toMatchObject({ key: "t.stream", kind: "stream", items: 2, status: "ok" });
  });

  it("ends the span of a stream closed before its first item, and the source of the handler gets return() (audit s21)", async () => {
    const registry = new ProcedureRegistry();
    // The source opens with the call, as a subscription does: not a generator that starts at the first read
    const state = { closed: false };
    const source: AsyncIterableIterator<number> = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: async () => ({ value: 1, done: false }),
      return: async () => {
        state.closed = true;
        return { value: undefined, done: true };
      },
    };
    registry.register(defineProcedure({ path: ["t", "opened"], input: any, output: any, handler: (() => source) as never }) as AnyProcedure);
    const spans: InvocationSpan[] = [];
    // The timeout wrapper sits between the span and the handler, as for a call with a deadline
    const interceptors = [tracingInterceptor({ onSpan: (span) => spans.push(span) }), timeoutInterceptor({ limit: ms(1000) })];
    const output = await invokePath(["t", "opened"], {}, { registry, interceptors });
    if (output.kind !== "stream") throw new Error("expected a stream");
    await output.items.return(undefined);
    // Before, an async generator ignored a return() before its first next(): no wrapper ran its end
    expect(state.closed).toBe(true);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ key: "t.opened", kind: "stream", items: 0, status: "ok" });
  });
});

describe("metricsInterceptor", () => {
  it("counts the calls, the errors and the time for each procedure", async () => {
    const { registry } = setup();
    const metrics = metricsInterceptor();
    await invokePath(["t", "outer"], {}, { registry, interceptors: [metrics.interceptor] });
    await invokePath(["t", "fail"], {}, { registry, interceptors: [metrics.interceptor] }).catch(() => undefined);
    const snapshot = metrics.snapshot();
    expect(snapshot["t.outer"]).toMatchObject({ calls: 1, errors: 0 });
    expect(snapshot["t.leaf"]).toMatchObject({ calls: 1, errors: 0 });
    expect(snapshot["t.fail"]).toMatchObject({ calls: 1, errors: 1 });
    expect(snapshot["t.outer"]!.totalMs).toBeGreaterThanOrEqual(0);
  });
});

describe("hosts take interceptors", () => {
  it("ProcedureServer runs them for each request and its nested calls", async () => {
    const { registry } = setup();
    const paths: string[] = [];
    const record: Interceptor = (invocation, next) => {
      paths.push(invocation.path.join("."));
      return next();
    };
    const server = new ProcedureServer({ registry, autoRegister: true, interceptors: [record] });
    const response = await server.handle({ id: "1", method: { service: "t", operation: "outer" }, payload: {}, metadata: {} });
    expect(response.payload).toBe(20);
    expect(paths).toEqual(["t.outer", "t.leaf"]);
  });

  it("Client runs them for local procedures, and links the nested calls to their parent", async () => {
    const { registry } = setup();
    const spans: InvocationSpan[] = [];
    const client = new Client({
      transport: new LocalTransport({ registry }),
      interceptors: [tracingInterceptor({ onSpan: (span) => spans.push(span) })],
    });
    client.useRegistry(registry);
    expect(await client.exec({ $proc: ["t", "outer"], input: {} })).toBe(20);
    const outer = spans.find((span) => span.key === "t.outer");
    const leaf = spans.find((span) => span.key === "t.leaf");
    expect(leaf?.parentId).toBe(outer?.id);
  });
});
