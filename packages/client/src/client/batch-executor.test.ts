/**
 * The batch executor: every result of the stream strategy (deep dive CORE-2), `continueOnError`,
 * `executeRace` cancellation, `StreamConfig.bufferSize` and `emitPartial`.
 */

import { describe, it, expect } from "vitest";
import { BatchExecutor, type ExecutionContext } from "./batch-executor.js";
import type { ProcedureCallResult } from "./call-types.js";
import type { ResolvedRoute } from "./route-resolver.js";
import { Client } from "./client.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { ProcedureRegistry } from "../procedures/registry.js";

function route(name: string): ResolvedRoute {
  return {
    path: ["test", name],
    procedure: { path: ["test", name], input: outputSchema(), output: outputSchema(), metadata: {} },
    input: {},
    outputConfig: { type: "sponge" },
  };
}

const ok = (data: unknown): ProcedureCallResult => ({ success: true, data });
const context: ExecutionContext = { metadata: {} };

/** A gate that releases every waiting call in the same tick. */
function gate(): { wait: () => Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { wait: () => promise, open };
}

describe("the stream strategy (deep dive CORE-2)", () => {
  it("yields every result when several calls settle in the same tick", async () => {
    const g = gate();
    const executor = new BatchExecutor(async (resolved) => {
      await g.wait();
      return ok(resolved.path[1]);
    });
    const routes = ["a", "b", "c", "d"].map(route);

    const seen: string[] = [];
    const reading = (async () => {
      for await (const item of executor.executeStream(routes, context)) seen.push(String(item.result.data));
    })();
    g.open();
    await reading;

    expect(seen.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("gives every result through route() with the stream strategy", async () => {
    const g = gate();
    const reg = new ProcedureRegistry();
    for (const name of ["a", "b", "c", "d"]) {
      reg.register(
        defineProcedure({
          path: ["test", name],
          input: outputSchema<Record<string, never>>(),
          output: outputSchema<string>(),
          handler: async () => {
            await g.wait();
            return name;
          },
        })
      );
    }
    const client = new Client({ send: async function* () {} } as never).useRegistry(reg);

    const pending = client.route({ batch: { strategy: "stream" }, route: { test: { a: {}, b: {}, c: {}, d: {} } } });
    g.open();
    const response = (await pending) as unknown as { test: Record<string, ProcedureCallResult> };

    expect(Object.keys(response.test).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the concurrency limit", async () => {
    let running = 0;
    let peak = 0;
    const executor = new BatchExecutor(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running--;
      return ok(1);
    });
    const items = [];
    for await (const item of executor.executeStream(["a", "b", "c", "d", "e"].map(route), context, {
      strategy: "stream",
      streamConfig: { concurrency: 2 },
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(5);
    expect(peak).toBe(2);
  });

  it("starts no new call while bufferSize results wait for the reader", async () => {
    const started: string[] = [];
    const executor = new BatchExecutor(async (resolved) => {
      started.push(resolved.path[1]!);
      return ok(resolved.path[1]);
    });
    const iterator = executor
      .executeStream(["a", "b", "c", "d"].map(route), context, {
        strategy: "stream",
        streamConfig: { concurrency: 1, bufferSize: 1 },
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    // One result read, at most one more waits in the buffer
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(started.length).toBeLessThanOrEqual(2);
    await iterator.return?.(undefined);
  });

  it("with emitPartial: false, yields the results in route order after all calls end", async () => {
    const executor = new BatchExecutor(async (resolved) => {
      const delay = { a: 6, b: 1, c: 3 }[resolved.path[1] as "a" | "b" | "c"];
      await new Promise((resolve) => setTimeout(resolve, delay));
      return ok(resolved.path[1]);
    });
    const order: string[] = [];
    for await (const item of executor.executeStream(["a", "b", "c"].map(route), context, {
      strategy: "stream",
      streamConfig: { emitPartial: false },
    })) {
      order.push(String(item.result.data));
    }
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("aborts the calls that still run when the reader stops", async () => {
    const aborted: string[] = [];
    const executor = new BatchExecutor((resolved, ctx) => {
      if (resolved.path[1] === "fast") return Promise.resolve(ok("fast"));
      return new Promise((resolve) => {
        ctx.signal?.addEventListener("abort", () => {
          aborted.push(resolved.path[1]!);
          resolve(ok("aborted"));
        });
      });
    });
    for await (const item of executor.executeStream(["fast", "slow1", "slow2"].map(route), context)) {
      expect(item.result.data).toBe("fast");
      break;
    }
    expect(aborted.sort()).toEqual(["slow1", "slow2"]);
  });
});

describe("continueOnError", () => {
  const failing = new BatchExecutor(async (resolved, ctx) => {
    if (resolved.path[1] === "bad") return { success: false, error: { code: "X", message: "bad", retryable: false, path: resolved.path } };
    // The good calls wait until the signal aborts, or 20 ms
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 20);
      ctx.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return ok(ctx.signal?.aborted ? "aborted" : "done");
  });

  it("runs every call by default", async () => {
    const result = await failing.executeAll(["bad", "good"].map(route), context);
    expect(result.results.map((r) => r.result.data ?? r.result.error?.code)).toEqual(["X", "done"]);
    expect(result.success).toBe(false);
  });

  it("with continueOnError: false, cancels the other calls after the first failure", async () => {
    const result = await failing.executeAll(["bad", "good", "good2"].map(route), context, {
      strategy: "all",
      continueOnError: false,
    });
    const codes = result.results.map((r) => r.result.error?.code);
    expect(codes).toEqual(["X", "CANCELLED", "CANCELLED"]);
  });
});

describe("executeRace", () => {
  it("aborts the losers", async () => {
    const aborted: string[] = [];
    const executor = new BatchExecutor((resolved, ctx) => {
      if (resolved.path[1] === "winner") return Promise.resolve(ok("winner"));
      return new Promise((resolve) => {
        ctx.signal?.addEventListener("abort", () => {
          aborted.push(resolved.path[1]!);
          resolve(ok("aborted"));
        });
      });
    });
    const result = await executor.executeRace(["loser", "winner"].map(route), context);
    expect(result.results[0]?.result.data).toBe("winner");
    expect(aborted).toEqual(["loser"]);
  });
});
