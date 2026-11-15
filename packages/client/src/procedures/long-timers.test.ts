/**
 * The time limits of the client with a time above 2147483647 ms, the longest delay of `setTimeout`.
 * The clock arms such a time in steps. Thus the limit holds, and the call does not end after 1 ms.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { invokePath, outputValue } from "./invoke.js";
import { timeoutAfterMs } from "./interceptors.js";
import { UNLIMITED_CAPABILITY } from "./capability.js";
import type { AnyProcedure, ProcedureContext } from "./types.js";
import { Client } from "../client/client.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { createOverallTimeoutMiddleware, createTimeoutMiddleware } from "../client/middleware/timeout.js";
import { ms } from "../duration.js";
import { pathToMethod } from "../server/method.js";

const any = outputSchema<unknown>();
const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

/** The longest delay of `setTimeout`. A longer delay starts the function after 1 ms. */
const LONGEST_DELAY = 2_147_483_647;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

function setup(): { registry: ProcedureRegistry; open: () => void } {
  const registry = new ProcedureRegistry();
  let open = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const add = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown) =>
    registry.register(defineProcedure({ path, input: any, output: any, handler: handler as never }) as AnyProcedure);
  add(["t", "slow"], async () => {
    await sleep(50);
    return "done";
  });
  add(["t", "gate"], async () => {
    await gate;
    return "open";
  });
  add(["t", "hang"], (_input, ctx) => new Promise((resolve) => ctx.signal?.addEventListener("abort", () => resolve("late"))));
  return { registry, open };
}

describe("a time limit above the longest delay of setTimeout", () => {
  it("does not end the call after 1 ms", async () => {
    const { registry } = setup();
    const output = await invokePath(["t", "slow"], {}, { registry, interceptors: [timeoutAfterMs({ ms: LONGEST_DELAY + 1000 })] });
    expect(await outputValue(output)).toBe("done");
  });

  it("ends the call at the end of the limit", async () => {
    vi.useFakeTimers();
    const { registry } = setup();
    const call = invokePath(["t", "hang"], {}, { registry, interceptors: [timeoutAfterMs({ ms: LONGEST_DELAY + 1000 })] });
    let settled = false;
    call.then(
      () => (settled = true),
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(LONGEST_DELAY + 999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(call).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("sets no timer for a limit of Infinity", async () => {
    vi.useFakeTimers();
    const { registry, open } = setup();
    const call = invokePath(["t", "gate"], {}, { registry, interceptors: [timeoutAfterMs({ ms: Number.POSITIVE_INFINITY })] });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    open();
    expect(await outputValue(await call)).toBe("open");
  });

  it("holds a deadline of a capability 30 days away", async () => {
    const { registry } = setup();
    const capability = { ...UNLIMITED_CAPABILITY, deadline: Date.now() + THIRTY_DAYS };
    const output = await invokePath(["t", "slow"], {}, { registry, capability });
    expect(await outputValue(output)).toBe("done");
  });

  it("holds a time limit of 30 days in the timeout middleware of the client", async () => {
    const { registry } = setup();
    const method = pathToMethod(["t", "slow"]);
    const perAttempt = new Client(new LocalTransport({ registry })).use(createTimeoutMiddleware({ perAttempt: ms(THIRTY_DAYS) }));
    await expect(perAttempt.call(method, {})).resolves.toBe("done");
    const overall = new Client(new LocalTransport({ registry })).use(createOverallTimeoutMiddleware({ overall: ms(THIRTY_DAYS) }));
    await expect(overall.call(method, {})).resolves.toBe("done");
  });
});
