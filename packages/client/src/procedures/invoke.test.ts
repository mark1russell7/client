/**
 * invokeProcedure() and streaming through the in-process hosts (ARCHITECTURE-PROPOSALS P1, P3).
 *
 * Regressions: BUGS-2026-07 H9 (a generator handler was never detected: `await handler()` gave
 * the generator object as the output) and H8 (the `out` config of a route leaf did nothing).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Client } from "../client/client.js";
import { LocalTransport } from "../adapters/local/client/index.js";
import { ProcedureRegistry } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema, zodAdapter } from "./core/schemas.js";
import { coreProcedures } from "./core/index.js";
import { InvocationError, invokeProcedure, invokePath, outputItems, outputValue } from "./invoke.js";
import type { ProcedureContext } from "./types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Fixture {
  registry: ProcedureRegistry;
  closed: string[];
}

function makeRegistry(): Fixture {
  const closed: string[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of coreProcedures) registry.register(procedure);
  registry.register(
    defineProcedure({
      path: ["test", "count"],
      input: zodAdapter<{ to: number }>(z.object({ to: z.number() })),
      output: outputSchema<number>(),
      handler: async function* (input: { to: number }) {
        try {
          for (let n = 1; n <= input.to; n++) {
            await sleep(1);
            yield n;
          }
        } finally {
          closed.push("count");
        }
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "forever"],
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<number>(),
      handler: async function* () {
        try {
          for (let n = 0; ; n++) {
            await sleep(2);
            yield n;
          }
        } finally {
          closed.push("forever");
        }
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "badItem"],
      input: outputSchema<Record<string, never>>(),
      output: zodAdapter<number>(z.number()),
      handler: async function* () {
        yield 1;
        yield "two" as unknown as number;
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "failAfterOne"],
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<number>(),
      handler: async function* () {
        yield 1;
        throw new Error("broke after one");
      },
    }),
  );
  registry.register(
    defineProcedure({
      path: ["test", "sumOfCount"],
      input: zodAdapter<{ to: number }>(z.object({ to: z.number() })),
      output: outputSchema<number>(),
      // A procedure that reads another procedure's stream through its context
      handler: async (input: { to: number }, ctx: ProcedureContext) => {
        let sum = 0;
        for await (const n of ctx.client.stream!<{ to: number }, number>(["test", "count"], input)) sum += n;
        return sum;
      },
    }),
  );
  return { registry, closed };
}

const stubTransport = { name: "stub", send: async function* () {}, close: async () => {} } as unknown as ConstructorParameters<typeof Client>[0];

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
}

describe("invokeProcedure", () => {
  it("detects a generator handler and gives a stream (H9)", async () => {
    const { registry } = makeRegistry();
    const output = await invokePath<number>(["test", "count"], { to: 3 }, { registry });
    expect(output.kind).toBe("stream");
    expect(await collect(outputItems(output))).toEqual([1, 2, 3]);
  });

  it("gives the last item in the sponge mode, and an error for an empty stream", async () => {
    const { registry } = makeRegistry();
    expect(await outputValue(await invokePath<number>(["test", "count"], { to: 3 }, { registry }))).toBe(3);
    await expect(outputValue(await invokePath(["test", "count"], { to: 0 }, { registry }), ["test", "count"])).rejects.toMatchObject({
      code: "NO_OUTPUT",
    });
  });

  it("validates the input before the handler, and each item of a stream", async () => {
    const { registry } = makeRegistry();
    await expect(invokePath(["test", "count"], { to: "three" }, { registry })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const output = await invokePath(["test", "badItem"], {}, { registry });
    const items: unknown[] = [];
    await expect(
      (async () => {
        for await (const item of outputItems(output)) items.push(item);
      })(),
    ).rejects.toMatchObject({ code: "OUTPUT_VALIDATION_ERROR" });
    expect(items).toEqual([1]);
  });

  it("ends the handler's generator when the reader stops early", async () => {
    const { registry, closed } = makeRegistry();
    const output = await invokePath<number>(["test", "forever"], {}, { registry });
    const items: number[] = [];
    for await (const item of outputItems(output)) {
      items.push(item);
      if (items.length === 3) break;
    }
    expect(items).toEqual([0, 1, 2]);
    expect(closed).toEqual(["forever"]);
  });

  it("stops a stream when the signal aborts", async () => {
    const { registry } = makeRegistry();
    const controller = new AbortController();
    const output = await invokePath<number>(["test", "forever"], {}, { registry, signal: controller.signal });
    const items: number[] = [];
    await expect(
      (async () => {
        for await (const item of outputItems(output)) {
          items.push(item);
          if (items.length === 2) controller.abort();
        }
      })(),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(items).toEqual([0, 1]);
  });

  it("gives a nested call the stream of another procedure through ctx.client.stream", async () => {
    const { registry } = makeRegistry();
    expect(await outputValue(await invokePath(["test", "sumOfCount"], { to: 4 }, { registry }))).toBe(10);
  });

  it("refuses a nested call of a data-driven procedure to a procedure outside the expose rule", async () => {
    const { registry } = makeRegistry();
    const chain = registry.get(["client", "chain"])!;
    const expose = (path: string[]): boolean => path[0] === "client";
    await expect(
      invokeProcedure(chain, { steps: [{ $proc: ["test", "count"], input: { to: 1 } }] }, { registry, expose }),
    ).rejects.toBeInstanceOf(InvocationError);
  });
});

describe("Client with streaming procedures", () => {
  it("exec() gives the last item, execStream() gives each item", async () => {
    const { registry } = makeRegistry();
    const client = new Client(stubTransport).useRegistry(registry);
    expect(await client.exec(["test", "count"], { to: 3 })).toBe(3);
    expect(await collect(client.execStream(["test", "count"], { to: 3 }))).toEqual([1, 2, 3]);
    expect(await collect(client.execStream(["client", "identity"], { value: "one" }))).toEqual(["one"]);
  });

  it("execStream() ends the handler when the reader stops", async () => {
    const { registry, closed } = makeRegistry();
    const client = new Client(stubTransport).useRegistry(registry);
    for await (const n of client.execStream<number>(["test", "forever"], {})) {
      if (n === 2) break;
    }
    expect(closed).toEqual(["forever"]);
  });
});

describe("LocalTransport with a registry", () => {
  it("runs a procedure by path: one item for a value, one item for each value of a stream", async () => {
    const { registry } = makeRegistry();
    const client = new Client(new LocalTransport({ registry }));
    expect(await client.call({ service: "client", operation: "identity" }, { value: 5 })).toBe(5);
    expect(await collect(client.stream({ service: "test", operation: "count" }, { to: 3 }))).toEqual([1, 2, 3]);
    expect(await client.call({ service: "test", operation: "count" }, { to: 3 })).toBe(3);
  });

  it("splits the method on dots in both conventions", async () => {
    const registry = new ProcedureRegistry();
    registry.register(
      defineProcedure({
        path: ["mongo", "documents", "find"],
        input: outputSchema<Record<string, never>>(),
        output: outputSchema<string>(),
        handler: () => "found",
      }),
    );
    const client = new Client(new LocalTransport({ registry }));
    expect(await client.call({ service: "mongo", operation: "documents.find" }, {})).toBe("found");
    expect(await client.call({ service: "mongo.documents", operation: "find" }, {})).toBe("found");
  });

  it("ends a stream with an error item when the handler throws", async () => {
    const { registry } = makeRegistry();
    const client = new Client(new LocalTransport({ registry }));
    const items: unknown[] = [];
    await expect(
      (async () => {
        for await (const item of client.stream({ service: "test", operation: "failAfterOne" }, {})) items.push(item);
      })(),
    ).rejects.toThrow("broke after one");
    expect(items).toEqual([1]);
  });

  it("validates the input: an invalid input gives a VALIDATION_ERROR", async () => {
    const { registry } = makeRegistry();
    const client = new Client(new LocalTransport({ registry }));
    await expect(client.call({ service: "test", operation: "count" }, { to: "x" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("finds a handler that the constructor got as \"service.operation\" (before, it was never found)", async () => {
    const client = new Client(new LocalTransport({ handlers: { "math.double": (n: unknown) => (n as number) * 2 } }));
    expect(await client.call({ service: "math", operation: "double" }, 21)).toBe(42);
  });
});

describe("route() output configs (H8)", () => {
  it("out: stream gives the items as an AsyncIterable", async () => {
    const { registry } = makeRegistry();
    const client = new Client(stubTransport).useRegistry(registry);
    const response = (await client.route({ route: { test: { count: { in: { to: 3 }, out: { type: "stream" } } } } })) as unknown as {
      test: { count: { success: boolean; data: AsyncIterable<number> } };
    };
    expect(response.test.count.success).toBe(true);
    expect(await collect(response.test.count.data)).toEqual([1, 2, 3]);
  });

  it("out: sponge gives the last item, or accumulate of all items", async () => {
    const { registry } = makeRegistry();
    const client = new Client(stubTransport).useRegistry(registry);
    const last = (await client.route({ route: { test: { count: { in: { to: 4 } } } } })) as unknown as {
      test: { count: { data: number } };
    };
    expect(last.test.count.data).toBe(4);
    const accumulate = <T>(previous: T[], current: T): T => [...previous, current] as unknown as T;
    const all = (await client.route({
      route: { test: { count: { in: { to: 3 }, out: { type: "sponge", accumulate } } } },
    })) as unknown as { test: { count: { data: number[] } } };
    expect(all.test.count.data).toEqual([1, 2, 3]);
  });

  it("out: handlers calls progress for each item but the last, then complete", async () => {
    const { registry } = makeRegistry();
    const client = new Client(stubTransport).useRegistry(registry);
    const progress: number[] = [];
    const complete: number[] = [];
    const response = (await client.route({
      route: {
        test: {
          count: {
            in: { to: 3 },
            out: { progress: (n: unknown) => void progress.push(n as number), complete: (n: unknown) => void complete.push(n as number) },
          },
        },
      },
    })) as unknown as { test: { count: { success: boolean; data: number } } };
    expect(progress).toEqual([1, 2]);
    expect(complete).toEqual([3]);
    expect(response.test.count).toEqual({ success: true, data: 3 });
  });

  it("out: handlers calls error, and the result is a failure", async () => {
    const { registry } = makeRegistry();
    const client = new Client(stubTransport).useRegistry(registry);
    const errors: string[] = [];
    const response = (await client.route({
      route: { test: { failAfterOne: { in: {}, out: { error: (error: Error) => void errors.push(error.message) } } } },
    })) as unknown as { test: { failAfterOne: { success: boolean } } };
    expect(errors).toEqual(["broke after one"]);
    expect(response.test.failAfterOne.success).toBe(false);
  });
});
