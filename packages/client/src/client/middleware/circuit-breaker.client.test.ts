/**
 * The circuit breaker through `Client` (deep dive TRN-4).
 *
 * With `throwOnError: true`, `Client.stream` throws at the error item, and the middleware's
 * generator gets return() at its yield: the old code recorded the failure after its loop, so
 * it never recorded one, and all calls reached the transport.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../client.js";
import { createCircuitBreakerMiddleware, getCircuitBreakerStats, CircuitBreakerError } from "./circuit-breaker.js";
import type { Message, ResponseItem, Transport } from "../types.js";

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
      const breaker = createCircuitBreakerMiddleware({ failureThreshold: 3, resetTimeout: 60_000 });
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
    const breaker = createCircuitBreakerMiddleware({ failureThreshold: 1, resetTimeout: 20, successThreshold: 1, halfOpenMaxRequests: 1 });
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
