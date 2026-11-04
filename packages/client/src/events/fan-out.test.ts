/**
 * The bounded fan-out of the event bus (roadmap CLI-90). The tests give the bus their own `schedule`,
 * so each slice runs when the test says. The count of calls in a slice is the gate of the fan-out:
 * it holds on each machine, and the bench `bench/fan-out-*.ts` gives the times.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { DefaultEventBus, createEventBus } from "./bus.js";
import type { EventBusOptions } from "./types.js";

const RUNS = Number(process.env["FC_RUNS"] ?? 200);

/** A bus whose slices wait for `step()`. */
function slicedBus(sliceSize: number, options: EventBusOptions = {}): { bus: DefaultEventBus; waiting: () => number; step: () => void; run: () => void } {
  const slices: Array<() => void> = [];
  const bus = new DefaultEventBus({ ...options, fanOut: { sliceSize, schedule: (slice) => void slices.push(slice), ...options.fanOut } });
  const step = (): void => slices.shift()?.();
  return {
    bus,
    waiting: () => slices.length,
    step,
    run: () => {
      while (slices.length > 0) step();
    },
  };
}

/** Handlers that record their calls on one channel. */
function subscribe(bus: DefaultEventBus, channel: string, count: number): { calls: number[][]; off: Array<() => void> } {
  const calls: number[][] = Array.from({ length: count }, () => []);
  const off = calls.map((seen) => bus.on<number>(channel, (data) => void seen.push(data)));
  return { calls, off };
}

const total = (calls: readonly number[][]): number => calls.reduce((sum, seen) => sum + seen.length, 0);

describe("a small channel stays synchronous (CLI-90)", () => {
  it("calls each handler before emit returns, at the size of a slice", () => {
    const { bus, waiting } = slicedBus(3);
    const { calls } = subscribe(bus, "c", 3);
    bus.emit("c", 1);
    expect(calls).toEqual([[1], [1], [1]]);
    expect(waiting()).toBe(0);
  });

  it("a bus without the option stays synchronous at each size", () => {
    const bus = new DefaultEventBus();
    const { calls } = subscribe(bus, "c", 1000);
    bus.emit("c", 1);
    expect(total(calls)).toBe(1000);
  });

  it("a handler added during a synchronous emit gets the event, as before", () => {
    const { bus } = slicedBus(8);
    const seen: number[] = [];
    bus.on<number>("c", () => {
      bus.on<number>("c", (data) => void seen.push(data));
    });
    bus.emit("c", 1);
    expect(seen).toEqual([1]);
  });
});

describe("a large channel delivers in slices (CLI-90)", () => {
  it("calls no handler in emit, and at most sliceSize handlers in each slice", () => {
    const { bus, waiting, step } = slicedBus(4);
    const { calls } = subscribe(bus, "c", 10);
    bus.emit("c", 1);
    expect(total(calls)).toBe(0);
    for (const expected of [4, 8, 10]) {
      step();
      expect(total(calls)).toBe(expected);
    }
    expect(waiting()).toBe(0);
  });

  it("a slice takes the next event when an event ends in it, and stays under the limit", () => {
    const { bus, step } = slicedBus(4);
    const { calls } = subscribe(bus, "c", 6);
    bus.emit("c", 1);
    bus.emit("c", 2);
    step();
    step();
    expect(total(calls)).toBe(8);
    step();
    expect(total(calls)).toBe(12);
  });

  it("the default schedule ends the fan-out, and drained() resolves after it", async () => {
    const bus = new DefaultEventBus({ fanOut: { sliceSize: 2 } });
    const { calls } = subscribe(bus, "c", 7);
    bus.emit("c", 1);
    expect(total(calls)).toBe(0);
    await bus.drained();
    expect(total(calls)).toBe(7);
    await bus.drained();
  });

  it("refuses a slice size that is not a whole number from 1 up", () => {
    for (const sliceSize of [0, -1, 1.5, Number.NaN]) {
      expect(() => new DefaultEventBus({ fanOut: { sliceSize } })).toThrow(RangeError);
    }
    for (const maxPending of [0, -1, 1.5]) {
      expect(() => new DefaultEventBus({ fanOut: { sliceSize: 1, maxPending } })).toThrow(RangeError);
    }
  });
});

describe("the order and the membership of a fan-out (CLI-90)", () => {
  it("keeps the order of emit for each handler, also for an emit of a small channel behind a large event", () => {
    const { bus, run } = slicedBus(2);
    const { calls, off } = subscribe(bus, "c", 3);
    bus.emit("c", 1);
    off[2]!();
    // The channel now has 2 handlers, but its first event still waits
    bus.emit("c", 2);
    bus.emit("c", 3);
    expect(total(calls)).toBe(0);
    run();
    expect(calls).toEqual([[1, 2, 3], [1, 2, 3], []]);
  });

  it("a handler removed during the fan-out gets no later call", () => {
    const { bus, step, run } = slicedBus(2);
    const { calls, off } = subscribe(bus, "c", 5);
    bus.emit("c", 1);
    step();
    off[1]!();
    off[3]!();
    run();
    expect(calls).toEqual([[1], [1], [1], [], [1]]);
  });

  it("a handler removed by a handler of the same slice gets no call", () => {
    const { bus, run } = slicedBus(10);
    const seen: string[] = [];
    let offLast = (): void => {};
    bus.on("c", () => {
      seen.push("first");
      offLast();
    });
    for (const name of ["a", "b"]) bus.on("c", () => void seen.push(name));
    for (let i = 0; i < 8; i++) bus.on("c", () => {});
    offLast = bus.on("c", () => void seen.push("last"));
    bus.emit("c", 1);
    run();
    expect(seen).toEqual(["first", "a", "b"]);
  });

  it("a handler added after emit gets only the later events", () => {
    const { bus, run } = slicedBus(1);
    subscribe(bus, "c", 2);
    bus.emit("c", 1);
    const late = subscribe(bus, "c", 1);
    bus.emit("c", 2);
    run();
    expect(late.calls).toEqual([[2]]);
  });

  it("a handler that leaves and comes back gets only the events after its return", () => {
    const { bus, run } = slicedBus(1);
    subscribe(bus, "c", 2);
    const seen: number[] = [];
    const handler = (data: number): void => void seen.push(data);
    const off = bus.on("c", handler);
    bus.emit("c", 1);
    off();
    bus.on("c", handler);
    bus.emit("c", 2);
    run();
    expect(seen).toEqual([2]);
  });

  it("a buffered channel gives a late handler each event one time", () => {
    const { bus, run } = slicedBus(1, { bufferSize: 4 });
    subscribe(bus, "c", 2);
    bus.emit("c", 1);
    const late = subscribe(bus, "c", 1);
    expect(late.calls).toEqual([[1]]);
    run();
    expect(late.calls).toEqual([[1]]);
  });

  it("clear() ends the fan-out of the channel, and a new handler gets no old event", async () => {
    const { bus, step, run } = slicedBus(2);
    const { calls } = subscribe(bus, "c", 6);
    bus.emit("c", 1);
    step();
    bus.clear("c");
    const fresh = subscribe(bus, "c", 1);
    run();
    expect(total(calls)).toBe(2);
    expect(fresh.calls).toEqual([[]]);
    await bus.drained();
  });
});

describe("the errors of a fan-out (CLI-90)", () => {
  it("an error and a rejection reach onError, and stop no other handler", async () => {
    const onError = vi.fn();
    const { bus, run } = slicedBus(2, { onError });
    bus.on("c", () => {
      throw new Error("sync");
    });
    bus.on("c", () => Promise.reject(new Error("async")));
    const { calls } = subscribe(bus, "c", 3);
    bus.emit("c", 1);
    run();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(onError.mock.calls.map(([error, channel]) => [(error as Error).message, channel])).toEqual([
      ["sync", "c"],
      ["async", "c"],
    ]);
    expect(total(calls)).toBe(3);
  });
});

describe("the queue of the slices is bounded (CLI-90)", () => {
  it("an emit over maxPending finishes the oldest events, and the bus loses none", () => {
    const { bus, run } = slicedBus(1, { fanOut: { sliceSize: 1, maxPending: 2 } });
    const { calls } = subscribe(bus, "c", 2);
    bus.emit("c", 1);
    bus.emit("c", 2);
    expect(total(calls)).toBe(0);
    bus.emit("c", 3);
    expect(calls).toEqual([[1], [1]]);
    run();
    expect(calls).toEqual([
      [1, 2, 3],
      [1, 2, 3],
    ]);
  });

  it("a handler that emits in a slice keeps the order, also when its emit finishes the event of the slice", () => {
    const { bus, run } = slicedBus(1, { fanOut: { sliceSize: 1, maxPending: 1 } });
    const seen: number[] = [];
    bus.on<number>("c", (data) => {
      seen.push(data);
      if (data === 1) bus.emit("c", 2);
    });
    const { calls } = subscribe(bus, "c", 1);
    bus.emit("c", 1);
    run();
    expect(seen).toEqual([1, 2]);
    expect(calls).toEqual([[1, 2]]);
  });
});

describe("the model of a fan-out (CLI-90)", () => {
  type Step = { kind: "emit" | "add" | "remove"; channel: number; index: number } | { kind: "slice" };

  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ kind: fc.constantFrom("emit" as const, "add" as const, "remove" as const), channel: fc.nat(1), index: fc.nat(20) }),
    fc.constant({ kind: "slice" as const }),
  );

  it("each handler gets the events of its time on the channel, in the order of emit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.array(step, { maxLength: 120 }), (sliceSize, steps) => {
        const { bus, step: slice, run } = slicedBus(sliceSize);
        type Handler = { channel: number; off: () => void; seen: number[]; expected: number[]; on: boolean };
        const handlers: Handler[] = [];
        let counter = 0;
        for (const next of steps) {
          if (next.kind === "slice") {
            slice();
          } else if (next.kind === "add") {
            const handler: Handler = { channel: next.channel, off: () => {}, seen: [], expected: [], on: true };
            handler.off = bus.on<number>(String(next.channel), (data) => void handler.seen.push(data));
            handlers.push(handler);
          } else if (next.kind === "remove") {
            const handler = handlers[next.index % Math.max(1, handlers.length)];
            if (handler?.on) {
              handler.on = false;
              handler.off();
            }
          } else {
            const data = ++counter;
            bus.emit(String(next.channel), data);
            for (const handler of handlers) if (handler.on && handler.channel === next.channel) handler.expected.push(data);
          }
        }
        run();
        for (const handler of handlers) {
          // A removal can take events that wait, so a handler gets a prefix of its events
          expect(handler.seen).toEqual(handler.expected.slice(0, handler.seen.length));
          if (handler.on) expect(handler.seen).toEqual(handler.expected);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("createEventBus (CLI-90)", () => {
  it("passes the option to the bus", async () => {
    const bus = createEventBus({ fanOut: { sliceSize: 1 } });
    const seen: number[] = [];
    bus.on<number>("c", (data) => void seen.push(data));
    bus.on<number>("c", (data) => void seen.push(data));
    bus.emit("c", 1);
    expect(seen).toEqual([]);
    await (bus as DefaultEventBus).drained();
    expect(seen).toEqual([1, 1]);
  });
});
