/**
 * The circuit breaker through `Client` (deep dive TRN-4).
 *
 * With `throwOnError: true`, `Client.stream` throws at the error item, and the middleware's
 * generator gets return() at its yield: the old code recorded the failure after its loop, so
 * it never recorded one, and all calls reached the transport.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { Client } from "../client.js";
import { createCircuitBreakerMiddleware, getCircuitBreakerStats, CircuitBreakerError } from "./circuit-breaker.js";
import type { ClientMiddleware, Message, ResponseItem, Transport } from "../types.js";
import type { MachineTransition } from "../../machines.js";
import { ms } from "../../duration.js";

const method = { service: "test", operation: "op" };

/** A transport that answers each call with an error item, or a success item after a gate. */
function transport(mode: () => "fail" | "ok", gate?: Promise<void>): { transport: Transport; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    transport: {
      name: "fake",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        calls++;
        if (gate) await gate;
        if (mode() === "fail") {
          yield { id: message.id, status: { type: "error", code: "UNAVAILABLE", message: "down", retryable: false }, payload: null as TRes, metadata: {} };
          return;
        }
        yield { id: message.id, status: { type: "success", code: 200 }, payload: "ok" as TRes, metadata: {} };
      },
      close: async () => {},
    },
  };
}

for (const throwOnError of [true, false]) {
  describe(`circuit breaker through Client (throwOnError: ${throwOnError})`, () => {
    it("opens after the threshold, so later calls do not reach the transport", async () => {
      const { transport: t, calls } = transport(() => "fail");
      const breaker = createCircuitBreakerMiddleware({ failureThreshold: 3, resetTimeout: ms(60_000) });
      const client = new Client({ transport: t, throwOnError }).use(breaker);
      const errors: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        try {
          await client.call(method, {});
        } catch (error) {
          errors.push(error);
        }
      }
      expect(calls()).toBe(3);
      expect(errors.filter((e) => e instanceof CircuitBreakerError)).toHaveLength(7);
      expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "OPEN", failures: 3, totalRequests: 10 });
    });
  });
}

describe("circuit breaker HALF_OPEN", () => {
  it("lets only the configured number of probes through at the same time", async () => {
    let mode: "fail" | "ok" = "fail";
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let gated = false;
    const fake = transport(() => mode);
    const slow: Transport = {
      name: "slow",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        if (gated) await gate;
        yield* fake.transport.send<TReq, TRes>(message);
      },
      close: async () => {},
    };
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 1, resetTimeout: ms(20), successThreshold: 1, halfOpenMaxRequests: 1 });
    const client = new Client(slow).use(breaker);

    await expect(client.call(method, {})).rejects.toThrow("down");
    expect(getCircuitBreakerStats(breaker)?.state).toBe("OPEN");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(getCircuitBreakerStats(breaker)?.state).toBe("HALF_OPEN");

    // One probe waits at the gate; a second call fails fast
    mode = "ok";
    gated = true;
    const probe = client.call(method, {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(client.call(method, {})).rejects.toBeInstanceOf(CircuitBreakerError);
    open();
    expect(await probe).toBe("ok");
    expect(getCircuitBreakerStats(breaker)?.state).toBe("CLOSED");
  });

  it("gives null stats for a middleware that is not a circuit breaker", () => {
    expect(getCircuitBreakerStats((next) => next)).toBeNull();
  });
});

/** The answer of the transport to one call. */
type Outcome = "ok" | "down" | "down twice" | "aborted" | "thrown";

/**
 * A transport that answers call n with `answer(n)`: an outcome, or a promise of an outcome for a
 * call that the test holds. It keeps the state of the breaker that each call carries.
 */
function answering(answer: (n: number) => Outcome | Promise<Outcome>) {
  let calls = 0;
  const seen: unknown[] = [];
  const transport: Transport = {
    name: "answering",
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      seen.push(structuredClone(message.metadata["circuitBreaker"]));
      const outcome = await answer(++calls);
      const error = (code: string): ResponseItem<TRes> => ({
        id: message.id,
        status: { type: "error", code, message: code === "UNAVAILABLE" ? "down" : code, retryable: false },
        payload: null as TRes,
        metadata: {},
      });
      if (outcome === "thrown") throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      if (outcome === "ok") yield { id: message.id, status: { type: "success", code: 200 }, payload: "ok" as TRes, metadata: {} };
      if (outcome === "aborted") yield error("ABORTED");
      if (outcome === "down" || outcome === "down twice") yield error("UNAVAILABLE");
      if (outcome === "down twice") yield error("UNAVAILABLE");
    },
    close: async () => {},
  };
  return { transport, calls: () => calls, seen };
}

/** An answer that the test gives later. */
function later(): { answer: Promise<Outcome>; give: (outcome: Outcome) => void } {
  let give!: (outcome: Outcome) => void;
  const answer = new Promise<Outcome>((resolve) => (give = resolve));
  return { answer, give };
}

describe("circuit breaker on a fake clock (R35)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts only the failures of the window, and gives the time of the last failure and of the last change", async () => {
    let wall = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => wall);
    const clock = fakeClock();
    const { transport } = answering(() => "down");
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 2, failureWindow: ms(1000), resetTimeout: ms(60_000), clock });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    expect(getCircuitBreakerStats(breaker)).toStrictEqual({
      state: "CLOSED",
      failures: 0,
      successes: 0,
      totalRequests: 0,
      lastFailureTime: null,
      lastStateChange: 1000,
    });

    wall = 2000;
    await client.call(method, {}); // a failure at 0 ms
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "CLOSED", failures: 1, lastFailureTime: 2000, lastStateChange: 1000 });
    await clock.advance(999);
    expect(getCircuitBreakerStats(breaker)?.failures).toBe(1);
    await clock.advance(1);
    expect(getCircuitBreakerStats(breaker)?.failures).toBe(0);

    // The first failure left the window: the second failure does not open the breaker
    wall = 3000;
    await client.call(method, {}); // at 1000 ms
    expect(getCircuitBreakerStats(breaker)?.state).toBe("CLOSED");
    wall = 4000;
    await clock.advance(500);
    await client.call(method, {}); // at 1500 ms
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "OPEN", failures: 2, lastFailureTime: 4000, lastStateChange: 4000 });
  });

  it("opens again when a probe fails, and starts the reset time again", async () => {
    const clock = fakeClock();
    const transitions: MachineTransition[] = [];
    const { transport, calls } = answering(() => "down");
    const client = new Client(transport).use(
      createCircuitBreakerMiddleware({ failureThreshold: 1, resetTimeout: ms(5000), successThreshold: 1, clock, onTransition: (transition) => transitions.push(transition) }),
    );
    // The call that opens the breaker gives the error of the transport: the fake clock has no unref()
    await expect(client.call(method, {})).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await clock.advance(5000);
    await expect(client.call(method, {})).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(transitions.map((transition) => `${transition.instance}: ${transition.from} -${transition.on}-> ${transition.to}`)).toEqual([
      "circuit-breaker: CLOSED -failure-threshold-> OPEN",
      "circuit-breaker: OPEN -reset-timeout-> HALF_OPEN",
      "circuit-breaker: HALF_OPEN -probe-failure-> OPEN",
    ]);
    await expect(client.call(method, {})).rejects.toBeInstanceOf(CircuitBreakerError);
    await clock.advance(4999);
    expect(transitions).toHaveLength(3);
    await clock.advance(1);
    expect(transitions[3]).toMatchObject({ from: "OPEN", on: "reset-timeout", to: "HALF_OPEN", at: 10_000 });
    expect(calls()).toBe(2);
  });

  it("names its transitions with the name of the option", async () => {
    const transitions: MachineTransition[] = [];
    const { transport } = answering(() => "down");
    const client = new Client({ transport, throwOnError: false }).use(
      createCircuitBreakerMiddleware({ failureThreshold: 1, name: "users", clock: fakeClock(), onTransition: (transition) => transitions.push(transition) }),
    );
    await client.call(method, {});
    expect(transitions.map((transition) => transition.instance)).toEqual(["users"]);
  });

  it("closes after successThreshold probes, one probe at a time, and forgets the failures", async () => {
    const clock = fakeClock();
    let next: Outcome = "down";
    const { transport, calls } = answering(() => next);
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 1, resetTimeout: ms(1000), successThreshold: 2, halfOpenMaxRequests: 1, clock });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    await client.call(method, {});
    await clock.advance(1000);
    next = "ok";
    await client.call(method, {});
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "HALF_OPEN", successes: 1 });
    await client.call(method, {});
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "CLOSED", successes: 0, failures: 0, lastFailureTime: null });
    expect(calls()).toBe(3);
  });

  it("counts a probe that ends with an abort as nothing", async () => {
    const clock = fakeClock();
    let next: Outcome = "down";
    const { transport } = answering(() => next);
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 1, resetTimeout: ms(1000), successThreshold: 1, clock });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    await client.call(method, {});
    await clock.advance(1000);
    next = "aborted";
    await client.call(method, {});
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "HALF_OPEN", successes: 0 });
    next = "ok";
    await client.call(method, {});
    expect(getCircuitBreakerStats(breaker)?.state).toBe("CLOSED");
  });

  it("counts a thrown error of the transport as a failure", async () => {
    const { transport, calls } = answering(() => "thrown");
    const client = new Client(transport).use(createCircuitBreakerMiddleware({ failureThreshold: 2, clock: fakeClock() }));
    await expect(client.call(method, {})).rejects.toThrow("ECONNREFUSED");
    await expect(client.call(method, {})).rejects.toThrow("ECONNREFUSED");
    await expect(client.call(method, {})).rejects.toBeInstanceOf(CircuitBreakerError);
    expect(calls()).toBe(2);
  });

  it("counts one failure for a call with two error items", async () => {
    const { transport } = answering(() => "down twice");
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 5, clock: fakeClock() });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    await client.call(method, {});
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ state: "CLOSED", failures: 1, successes: 0 });
  });

  it("writes its state for the other middlewares before and after each call, with the failures of the window", async () => {
    const clock = fakeClock();
    let next: Outcome = "down";
    const { transport, seen } = answering(() => next);
    const after: unknown[] = [];
    const outer = ((inner: (context: never) => AsyncIterable<unknown>) =>
      async function* (context: { message: Message<unknown> }) {
        yield* inner(context as never) as AsyncIterable<never>;
        after.push(structuredClone(context.message.metadata["circuitBreaker"]));
      }) as unknown as ClientMiddleware;
    const client = new Client({ transport, throwOnError: false })
      .use(outer)
      .use(createCircuitBreakerMiddleware({ failureThreshold: 3, failureWindow: ms(1000), clock }));
    await clock.advance(600);
    await client.call(method, {}); // a failure at 600 ms
    expect(seen[0]).toEqual({ state: "CLOSED", failures: 0, successes: 0 });
    expect(after[0]).toEqual({ state: "CLOSED", failures: 1, successes: 0 });
    next = "ok";
    await clock.advance(100);
    await client.call(method, {}); // at 700 ms: the failure is in the window
    expect(seen[1]).toEqual({ state: "CLOSED", failures: 1, successes: 0 });
    await clock.advance(900);
    await client.call(method, {}); // at 1600 ms: the failure left the window
    expect(seen[2]).toEqual({ state: "CLOSED", failures: 0, successes: 0 });
  });

  it("keeps the failures of the window at a success, and drops the older failures", async () => {
    vi.spyOn(Date, "now").mockReturnValue(5000);
    const clock = fakeClock();
    let next: Outcome = "down";
    const { transport } = answering(() => next);
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 2, failureWindow: ms(1000), clock });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    await clock.advance(600);
    await client.call(method, {}); // a failure at 600 ms
    next = "ok";
    await clock.advance(100);
    await client.call(method, {}); // a success at 700 ms
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ failures: 1, lastFailureTime: 5000 });
    await clock.advance(900);
    await client.call(method, {}); // a success at 1600 ms: the failure left the window
    expect(getCircuitBreakerStats(breaker)).toMatchObject({ failures: 0, lastFailureTime: null });
  });

  it("does not move the reset for a call that ends after the breaker opened, and keeps the last failure in the error", async () => {
    const clock = fakeClock();
    const held = [later(), later()];
    const { transport } = answering((n) => (n <= 2 ? held[n - 1]!.answer : "down"));
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 1, failureWindow: ms(1000), resetTimeout: ms(5000), clock });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    const slow = [client.call(method, {}), client.call(method, {})];
    await client.call(method, {}); // the third call fails at 0 ms: the breaker opens
    expect(getCircuitBreakerStats(breaker)?.state).toBe("OPEN");

    await clock.advance(2000);
    held[0]!.give("ok"); // a slow call ends well at 2000 ms
    await slow[0];
    const error = await client.call(method, {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CircuitBreakerError);
    expect(error).toMatchObject({ message: "Circuit breaker is OPEN: down", state: "OPEN", lastError: { message: "down" } });

    await clock.advance(1000);
    held[1]!.give("down"); // a slow call fails at 3000 ms
    await slow[1];
    await clock.advance(1999);
    expect(getCircuitBreakerStats(breaker)?.state).toBe("OPEN");
    await clock.advance(1);
    expect(getCircuitBreakerStats(breaker)?.state).toBe("HALF_OPEN");
  });

  it("does not count a call that started before HALF_OPEN as a probe", async () => {
    const clock = fakeClock();
    const slow = later();
    const probe = later();
    const { transport, calls } = answering((n) => (n === 1 ? slow.answer : n === 2 ? "down" : probe.answer));
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 1, resetTimeout: ms(1000), successThreshold: 1, halfOpenMaxRequests: 1, clock });
    const client = new Client({ transport, throwOnError: false }).use(breaker);
    const before = client.call(method, {}); // it starts while the breaker is closed
    await client.call(method, {}); // it fails: the breaker opens
    await clock.advance(1000);
    expect(getCircuitBreakerStats(breaker)?.state).toBe("HALF_OPEN");
    const probing = client.call(method, {}).catch((caught: unknown) => caught);
    await expect(client.call(method, {})).rejects.toBeInstanceOf(CircuitBreakerError);
    expect(calls()).toBe(3);
    probe.give("ok");
    expect(await probing).toBe("ok");
    expect(getCircuitBreakerStats(breaker)?.state).toBe("CLOSED");
    slow.give("ok");
    expect(await before).toBe("ok");
  });

  it("lets each call through while it is closed, also with no probes for HALF_OPEN", async () => {
    const { transport } = answering(() => "ok");
    const client = new Client(transport).use(createCircuitBreakerMiddleware({ halfOpenMaxRequests: 0, clock: fakeClock() }));
    expect(await client.call(method, {})).toBe("ok");
  });

  it("names the option of a time that is not a duration", () => {
    expect(() => createCircuitBreakerMiddleware({ failureWindow: 1000 as never })).toThrow(/^failureWindow must be a duration/);
    expect(() => createCircuitBreakerMiddleware({ resetTimeout: 1000 as never })).toThrow(/^resetTimeout must be a duration/);
  });
});
