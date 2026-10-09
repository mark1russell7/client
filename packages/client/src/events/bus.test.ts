/**
 * The event bus (deep dive CORE-15): `once()` on a buffered channel, a repeated unsubscribe,
 * `clear()` with stream readers, an aborted stream, and the bus of a procedure context.
 */

import { describe, it, expect } from "vitest";
import { createEventBus } from "./bus.js";
import { Client } from "../client/client.js";
import type { Transport } from "../client/types.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { invokeProcedure, outputItems } from "../procedures/invoke.js";
import type { ProcedureContext } from "../procedures/types.js";

describe("DefaultEventBus", () => {
  it("once() on a buffered channel resolves with the buffered event", async () => {
    const bus = createEventBus({ bufferSize: 2 });
    bus.emit("ch", "first");
    const errors: unknown[] = [];
    const bus2 = createEventBus({ bufferSize: 2, onError: (error) => errors.push(error) });
    bus2.emit("ch", "first");

    await expect(bus.once("ch")).resolves.toBe("first");
    await expect(bus2.once("ch")).resolves.toBe("first");
    expect(errors).toEqual([]);
    expect(bus2.subscriberCount("ch")).toBe(0);
  });

  it("a repeated old unsubscribe does not remove a newer subscriber", () => {
    const bus = createEventBus();
    const seen: string[] = [];
    const unsubscribeOld = bus.on("ch", () => seen.push("old"));
    unsubscribeOld();
    bus.on("ch", (data: string) => seen.push(data));
    unsubscribeOld();

    bus.emit("ch", "new");
    expect(seen).toEqual(["new"]);
  });

  it("clear() ends the stream readers of the channel", async () => {
    const bus = createEventBus();
    const reading = (async () => {
      const items: unknown[] = [];
      for await (const item of bus.stream("ch")) items.push(item);
      return items;
    })();
    await Promise.resolve();
    bus.emit("ch", 1);
    bus.clear("ch");
    await expect(reading).resolves.toEqual([1]);
  });

  it("clearAll() ends every stream reader", async () => {
    const bus = createEventBus();
    const reading = (async () => {
      for await (const _ of bus.stream("a")) {
        // no items
      }
      return "ended";
    })();
    await Promise.resolve();
    bus.clearAll();
    await expect(reading).resolves.toBe("ended");
  });

  it("a stream with a signal ends when the signal aborts", async () => {
    const bus = createEventBus();
    const controller = new AbortController();
    const reading = (async () => {
      for await (const _ of bus.stream("ch", { signal: controller.signal })) {
        // no items
      }
      return "ended";
    })();
    await Promise.resolve();
    controller.abort();
    await expect(reading).resolves.toBe("ended");
    expect(bus.subscriberCount("ch")).toBe(0);
  });

  it("once() with a signal rejects when the signal aborts", async () => {
    const bus = createEventBus();
    const controller = new AbortController();
    const waiting = bus.once("ch", { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toThrow(/abort/i);
    expect(bus.subscriberCount("ch")).toBe(0);
  });
});

describe("the bus of a procedure context", () => {
  const noTransport = { name: "none", send: async function* () {}, close: async () => {} } as unknown as Transport;

  function registry(): ProcedureRegistry {
    const reg = new ProcedureRegistry();
    reg.register(
      defineProcedure({
        path: ["events", "watch"],
        input: outputSchema<{ channel: string }>(),
        output: outputSchema<unknown>(),
        handler: async function* (input: { channel: string }, ctx: ProcedureContext) {
          // Subscribe before "ready": an event that the reader sends after "ready" arrives
          const events = ctx.bus!.stream(input.channel)[Symbol.asyncIterator]();
          yield "ready";
          for (;;) {
            const step = await events.next();
            if (step.done) return;
            yield step.value;
          }
        },
      })
    );
    reg.register(
      defineProcedure({
        path: ["events", "send"],
        input: outputSchema<{ channel: string; data: unknown }>(),
        output: outputSchema<null>(),
        handler: async (input: { channel: string; data: unknown }, ctx: ProcedureContext) => {
          ctx.bus!.emit(input.channel, input.data);
          return null;
        },
      })
    );
    return reg;
  }

  it("every invocation gets a bus, shared by default, so one procedure reaches another", async () => {
    const client = new Client(noTransport).useRegistry(registry());
    const items: unknown[] = [];
    for await (const item of client.execStream(["events", "watch"], { channel: "ctx-bus-1" })) {
      items.push(item);
      if (item === "ready") await client.exec(["events", "send"], { channel: "ctx-bus-1", data: "hello" });
      if (items.length === 2) break;
    }
    expect(items).toEqual(["ready", "hello"]);
  });

  it("a Client with its own bus gives that bus to its procedures", async () => {
    const bus = createEventBus();
    const client = new Client({ transport: noTransport, bus }).useRegistry(registry());
    let received: unknown;
    bus.on("ctx-bus-2", (data) => {
      received = data;
    });
    await client.exec(["events", "send"], { channel: "ctx-bus-2", data: 42 });
    expect(received).toBe(42);
  });

  it("a stream handler that waits on ctx.bus.stream() ends when the signal aborts", async () => {
    // The reader can stop such a handler only through the signal: a return() waits behind the
    // pending next(). The bus of the context ends its streams when the signal aborts, so the
    // handler leaves its loop, and its finally block runs.
    let finished = false;
    const reg = new ProcedureRegistry();
    reg.register(
      defineProcedure({
        path: ["events", "wait"],
        input: outputSchema<Record<string, never>>(),
        output: outputSchema<unknown>(),
        handler: async function* (_input: unknown, ctx: ProcedureContext) {
          try {
            yield "ready";
            for await (const item of ctx.bus!.stream("ctx-bus-3")) yield item;
          } finally {
            finished = true;
          }
        },
      })
    );
    const controller = new AbortController();
    const output = await invokeProcedure(reg.get(["events", "wait"])!, {}, { signal: controller.signal });
    const items = outputItems(output);
    expect((await items.next()).value).toBe("ready");
    const next = items.next();
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await expect(next).rejects.toThrow(/aborted/);
    for (let i = 0; i < 10 && !finished; i++) await new Promise((resolve) => setImmediate(resolve));
    expect(finished).toBe(true);
  });
});
