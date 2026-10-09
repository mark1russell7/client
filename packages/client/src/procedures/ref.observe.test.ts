/**
 * The hydration hook: `HydrateOptions.onRef` and `observeHydration()`. Each event names the ref
 * that runs and its consumer, the ref whose input holds it. The trace of the site uses it to show
 * a nested call under the call that gets its result (deep dive, the trace consumer edge).
 */

import { describe, it, expect, afterEach } from "vitest";
import { Client } from "../client/client.js";
import { ProcedureRegistry } from "./registry.js";
import { allCoreProcedures } from "./core/index.js";
import { hydrateInput, observeHydration, normalizeRef, type HydrationEvent, type AnyProcedureRef } from "./ref.js";

const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

function makeClient(): Client {
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  return new Client(stubTransport).useRegistry(registry);
}

const call = (name: string, input: unknown): AnyProcedureRef => ({ $proc: ["client", name], input }) as AnyProcedureRef;
const pathOf = (ref: AnyProcedureRef | undefined): string | undefined => (ref ? normalizeRef(ref).path.join(".") : undefined);
const summary = (events: HydrationEvent[]): Array<[string, string | undefined]> =>
  events.map((event) => [event.path.join("."), pathOf(event.consumer)]);

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
});

describe("HydrateOptions.onRef", () => {
  it("reports each ref that runs, after the refs of its input, with its consumer", async () => {
    const multiply = call("multiply", { a: 2, b: 3 });
    const add = call("add", { a: multiply, b: 1 });
    const events: HydrationEvent[] = [];
    const executor = async <TIn, TOut>(path: string[], input: TIn): Promise<TOut> => {
      const { a, b } = input as unknown as { a: number; b: number };
      return (path[1] === "multiply" ? a * b : a + b) as TOut;
    };

    const result = await hydrateInput({ value: add }, executor, { onRef: (event) => events.push(event) });

    expect(result).toEqual({ value: 7 });
    expect(summary(events)).toEqual([
      ["client.multiply", "client.add"],
      ["client.add", undefined],
    ]);
    // The event has the objects of the program
    expect(events[0]!.ref).toBe(multiply);
    expect(events[0]!.consumer).toBe(add);
  });

  it("reports no event for a ref that does not run", async () => {
    const events: HydrationEvent[] = [];
    const never = { $proc: ["client", "add"], input: { a: 1, b: 2 }, $when: "$never" };
    const later = { $proc: ["client", "add"], input: { a: 1, b: 2 }, $when: "$parent" };
    await hydrateInput({ never, later }, async () => 0 as never, { onRef: (event) => events.push(event) });
    expect(events).toEqual([]);
  });

  it("does not change the hydration when the function throws", async () => {
    const result = await hydrateInput({ v: call("add", { a: 1, b: 2 }) }, async () => 3 as never, {
      onRef: () => {
        throw new Error("a broken trace");
      },
    });
    expect(result).toEqual({ v: 3 });
  });
});

describe("observeHydration", () => {
  it("gets the events of client.exec(), also of control-flow operands", async () => {
    const events: HydrationEvent[] = [];
    stop = observeHydration((event) => events.push(event));
    const client = makeClient();

    const program = call("conditional", {
      condition: true,
      then: call("add", { a: call("multiply", { a: 2, b: 3 }), b: 1 }),
      else: 0,
    });
    expect(await client.exec(program as never)).toBe(7);

    // conditional runs its operand: hydration of the input of add runs multiply. The consumer is
    // undefined, because hydration starts at the input of add, and conditional then calls add.
    expect(summary(events)).toContainEqual(["client.multiply", undefined]);
  });

  it("gets the root input of client.exec() with its consumers, and stops after the remove function", async () => {
    const events: HydrationEvent[] = [];
    stop = observeHydration((event) => events.push(event));
    const client = makeClient();
    const program = call("identity", { value: call("add", { a: call("multiply", { a: 2, b: 3 }), b: 1 }) });

    expect(await client.exec(program as never)).toBe(7);
    expect(summary(events)).toEqual([
      ["client.multiply", "client.add"],
      ["client.add", undefined],
    ]);

    stop();
    stop = undefined;
    events.length = 0;
    await client.exec(program as never);
    expect(events).toEqual([]);
  });
});
