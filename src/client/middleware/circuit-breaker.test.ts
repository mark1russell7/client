import { describe, it, expect } from "vitest";
import { createCircuitBreakerMiddleware, CircuitBreakerError } from "./circuit-breaker.js";
import type { ClientContext, ClientRunner, ResponseItem } from "../types.js";

function ctx(): ClientContext {
  return {
    message: { id: "1", method: { service: "s", operation: "o" }, payload: {}, metadata: {} },
  } as ClientContext;
}
function errorItem(): ResponseItem {
  return { id: "1", status: { type: "error", code: "FAIL", message: "boom" }, payload: undefined, metadata: {} };
}
function successItem(): ResponseItem {
  return { id: "1", status: { type: "success", code: 200 }, payload: { ok: true }, metadata: {} };
}
async function drain(gen: AsyncGenerator<ResponseItem>): Promise<ResponseItem[]> {
  const out: ResponseItem[] = [];
  for await (const i of gen) out.push(i);
  return out;
}

describe("circuit breaker (regression: BUGS-2026-07 H11)", () => {
  it("opens after the threshold when failures arrive as error-status items (never thrown)", async () => {
    const mw = createCircuitBreakerMiddleware({ failureThreshold: 3, resetTimeout: 60000 });
    const failNext = (async function* () {
      yield errorItem();
    }) as unknown as ClientRunner;
    const run = mw(failNext) as unknown as (c: ClientContext) => AsyncGenerator<ResponseItem>;

    for (let i = 0; i < 3; i++) await drain(run(ctx())); // 3 error-status responses, no throw
    // Circuit should now be OPEN — the next request fails fast with CircuitBreakerError.
    await expect(drain(run(ctx()))).rejects.toBeInstanceOf(CircuitBreakerError);
  });

  it("stays closed while responses are success-status", async () => {
    const mw = createCircuitBreakerMiddleware({ failureThreshold: 2, resetTimeout: 60000 });
    const okNext = (async function* () {
      yield successItem();
    }) as unknown as ClientRunner;
    const run = mw(okNext) as unknown as (c: ClientContext) => AsyncGenerator<ResponseItem>;

    for (let i = 0; i < 5; i++) await drain(run(ctx()));
    const items = await drain(run(ctx())); // still closed — no throw
    expect(items[0]?.status.type).toBe("success");
  });
});
