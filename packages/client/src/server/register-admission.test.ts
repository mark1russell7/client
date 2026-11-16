/**
 * The admission of a handler of `register()` on a `ProcedureServer`. A handler of `register()`
 * passes the same door as a procedure:
 *
 * - The token, the request hook and `authenticate`: a request with no credentials, or without the
 *   token, gets `UNAUTHORIZED`, and the handler does not run.
 * - The limits: a limit that covers the route of the handler refuses a call above the limit.
 * - The stop: after `stopIntake()` a new call gets `UNAVAILABLE`, and a call in flight counts in
 *   `inFlight()` until its response.
 * - Each test reads time only from a fake clock: no real sleeps.
 */

import { describe, it, expect } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { createRegistry } from "../procedures/module.js";
import { seconds } from "../duration.js";
import { ProcedureServer } from "./procedure-server.js";
import { hostPolicy, procedureServerOptions } from "./host-policy.js";
import { pathToMethod } from "./method.js";
import type { CallLimit } from "./limits.js";
import type { Credentials, ServerRequest, ServerResponse } from "./types.js";
import { LOCAL_CREDENTIALS } from "./request-auth.js";

const TOKEN = "register-admission-token-0123456789";
const RESET = { service: "admin", operation: "reset" };

/** A server with a token and one handler of `register()`. The handler counts its runs and sees the principal of the request. */
function serverWith(options: { readonly limits?: readonly CallLimit[] } = {}): { server: ProcedureServer; runs: () => number; seen: unknown[] } {
  const policy = hostPolicy({ token: TOKEN, ...(options.limits ? { limits: options.limits } : {}) });
  const server = new ProcedureServer({ ...procedureServerOptions(policy, createRegistry({ name: "register-admission", procedures: [] })), clock: fakeClock() });
  let runs = 0;
  const seen: unknown[] = [];
  server.register(RESET, (request) => {
    runs++;
    seen.push(request.principal);
    return { id: request.id, status: { type: "success", code: 200 }, payload: "reset", metadata: {} };
  });
  return { server, runs: () => runs, seen };
}

let sent = 0;
/** A request of the method `admin.reset`, with these credentials. */
const request = (credentials: Credentials | undefined): ServerRequest => ({
  id: `call-${++sent}`,
  method: pathToMethod(["admin", "reset"]),
  payload: {},
  metadata: {},
  ...(credentials !== undefined ? { credentials } : {}),
});

/** The type of the status of a response: success, or the code of its error. */
const outcome = (response: ServerResponse<unknown>): string => (response.status.type === "success" ? "ok" : String(response.status.code));

describe("the admission of a handler of register() on a ProcedureServer", () => {
  it("refuses a request with no credentials or without the token, and does not run the handler", async () => {
    const { server, runs, seen } = serverWith();
    expect(outcome(await server.handle(request(undefined)))).toBe("UNAUTHORIZED");
    expect(outcome(await server.handle(request({ bearer: "not-the-token" })))).toBe("UNAUTHORIZED");
    expect(runs()).toBe(0);
    // The token gives the principal of the token, and a local request passes
    expect(outcome(await server.handle(request({ bearer: TOKEN })))).toBe("ok");
    expect(outcome(await server.handle(request(LOCAL_CREDENTIALS)))).toBe("ok");
    expect(runs()).toBe(2);
    expect(seen[0]).toEqual({ id: "token", via: "token" });
  });

  it("takes a unit of a limit that covers the route of the handler", async () => {
    const limit: CallLimit = {
      name: "admin.reset",
      key: "route",
      covers: { routes: ["admin.reset"] },
      policy: { type: "sliding-window", limit: { value: 1, unit: "count" }, window: seconds(60) },
      store: { kind: "local" },
      evict: { maxKeys: { value: 10, unit: "count" } },
    };
    const { server, runs } = serverWith({ limits: [limit] });
    expect(outcome(await server.handle(request({ bearer: TOKEN })))).toBe("ok");
    expect(outcome(await server.handle(request({ bearer: TOKEN })))).toBe("RATE_LIMITED");
    expect(runs()).toBe(1);
  });

  it("refuses a new call after stopIntake(), and counts a call in flight until its response", async () => {
    const { server } = serverWith();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.register({ service: "admin", operation: "slow" }, async (call) => {
      await gate;
      return { id: call.id, status: { type: "success", code: 200 }, payload: "done", metadata: {} };
    });
    const slow = server.handle({ id: "slow-1", method: pathToMethod(["admin", "slow"]), payload: {}, metadata: {}, credentials: LOCAL_CREDENTIALS });
    // The admission is asynchronous: wait until the call is in flight
    while (server.inFlight() === 0) await Promise.resolve();
    expect(server.inFlight()).toBe(1);
    server.stopIntake();
    expect(outcome(await server.handle(request({ bearer: TOKEN })))).toBe("UNAVAILABLE");
    release();
    expect(outcome(await slow)).toBe("ok");
    expect(server.inFlight()).toBe(0);
  });
});
