/**
 * The waits and timers of the bus: `once()` ends at `clear()` (tracker item O29), and
 * `debounceChannel()` and `throttleChannel()` take a `Duration` and a clock (tracker item O30).
 */

import { describe, it, expect } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { createEventBus, debounceChannel, throttleChannel } from "./bus.js";
import { ms, seconds } from "../duration.js";

describe("once() and clear()", () => {
  it("rejects with an AbortError when clear() removes its channel", async () => {
    const bus = createEventBus();
    const wait = bus.once("job:done");
    bus.clear("job:done");
    await expect(wait).rejects.toMatchObject({ name: "AbortError", message: expect.stringContaining("clear()") });
  });

  it("rejects at clearAll() too, and an event before the clear still resolves", async () => {
    const bus = createEventBus();
    const first = bus.once<number>("a");
    bus.emit("a", 1);
    await expect(first).resolves.toBe(1);
    const second = bus.once("a");
    bus.clearAll();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not reject a wait on another channel", async () => {
    const bus = createEventBus();
    const other = bus.once<string>("b");
    bus.clear("a");
    bus.emit("b", "yes");
    await expect(other).resolves.toBe("yes");
  });
});

describe("debounceChannel()", () => {
  it("sends the last event after the delay without a new event", async () => {
    const clock = fakeClock();
    const bus = createEventBus();
    const sent: number[] = [];
    bus.on<number>("out", (n) => {
      sent.push(n);
    });
    const stop = debounceChannel<number>(bus, "in", "out", ms(300), { clock });
    bus.emit("in", 1);
    await clock.advance(200);
    bus.emit("in", 2);
    await clock.advance(299);
    expect(sent).toEqual([]);
    await clock.advance(1);
    expect(sent).toEqual([2]);
    // After the stop, a pending send does not happen
    bus.emit("in", 3);
    stop();
    await clock.advance(1_000);
    expect(sent).toEqual([2]);
  });

  it("refuses a plain number of milliseconds", () => {
    const bus = createEventBus();
    expect(() => debounceChannel(bus, "in", "out", 300 as never)).toThrow(TypeError);
  });
});

describe("throttleChannel()", () => {
  it("sends at most one event in each interval and drops the others", async () => {
    const clock = fakeClock();
    const bus = createEventBus();
    const sent: number[] = [];
    bus.on<number>("out", (n) => {
      sent.push(n);
    });
    throttleChannel<number>(bus, "in", "out", seconds(1), { clock });
    bus.emit("in", 1);
    bus.emit("in", 2);
    await clock.advance(999);
    bus.emit("in", 3);
    await clock.advance(1);
    bus.emit("in", 4);
    expect(sent).toEqual([1, 4]);
  });

  it("refuses a plain number of milliseconds", () => {
    const bus = createEventBus();
    expect(() => throttleChannel(bus, "in", "out", 1000 as never)).toThrow(TypeError);
  });
});
