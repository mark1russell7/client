/**
 * The limits of the calls of a server (CLI-40): keyed limiters of `@mark1russell7/service/limiter`
 * in the admission path, on the clock of the server.
 *
 * - A limit of the writes of each tenant refuses a write above the limit with `RATE_LIMITED`. The
 *   refusal is retryable, with the wait in `retry-after` and the cause in `reason`. The call does
 *   not run.
 * - Each tenant has its own bucket. A limit of the writes does not limit the reads.
 * - The key is data (the principal, a claim, the route, a list of them) or a function. A call
 *   without a value of its key is outside the limit.
 * - A shared store follows `onStoreFailure`. A limit without its store, two limits with one name
 *   and a spec with a problem are refused at the start.
 * - Each test reads time only from a fake clock: no real sleeps.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { fakeClock, type FakeClock } from "@mark1russell7/service/testing";
import type { LimiterStore } from "@mark1russell7/service/limiter";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { seconds } from "../duration.js";
import { ProcedureServer } from "./procedure-server.js";
import { hostPolicy, procedureServerOptions } from "./host-policy.js";
import { pathToMethod } from "./method.js";
import type { CallLimit } from "./limits.js";
import type { PrincipalOf, ServerResponse } from "./types.js";

const WRITES = { reads: ["notes"], writes: ["notes"] };
const READS = { reads: ["notes"], writes: [] };

/** A count, as the policies of a limiter take it. */
const count = (value: number): { value: number; unit: string } => ({ value, unit: "count" });

/** The runs of each procedure: a refused call does not run. */
let runs: Record<string, number> = {};

function registryOf() {
  const procedure = (name: string, effects: typeof WRITES | typeof READS) =>
    createProcedure()
      .path(["notes", name])
      .input(z.object({}))
      .output(z.string())
      .meta({ effects })
      .handler(async () => {
        runs[name] = (runs[name] ?? 0) + 1;
        return name;
      })
      .build();
  return createRegistry({ name: "limits-test", procedures: [procedure("write", WRITES), procedure("read", READS), procedure("other", WRITES)] });
}

/** The request hook of the tests: the bearer token `tok-<tenant>` names the tenant of the principal. */
const principalOf: PrincipalOf = (credentials) => {
  const tenant = credentials.bearer?.startsWith("tok-") ? credentials.bearer.slice(4) : undefined;
  return tenant === undefined ? undefined : { principal: { id: `user:${tenant}`, via: "test", claims: { tenant } } };
};

/** Two writes of each tenant in each minute. */
const WRITES_PER_TENANT: CallLimit = {
  name: "notes.writes",
  key: { claim: "tenant" },
  covers: { writes: true },
  policy: { type: "sliding-window", limit: count(2), window: seconds(60) },
  store: { kind: "local" },
  evict: { maxKeys: count(100) },
};

/** One call of each tenant in each minute, for each call: the tests give the key and the cover. */
const ONE_EACH_MINUTE: CallLimit = {
  name: "one",
  key: { claim: "tenant" },
  policy: { type: "sliding-window", limit: count(1), window: seconds(60) },
  store: { kind: "local" },
  evict: { maxKeys: count(100) },
};

/** A server with the limits, on a fake clock, with the request hook of the tests. */
function serverOf(limits: readonly CallLimit[], clock: FakeClock = fakeClock(), limitStores?: Readonly<Record<string, LimiterStore>>): ProcedureServer {
  runs = {};
  const policy = hostPolicy({ principalOf, limits, ...(limitStores ? { limitStores } : {}) });
  return new ProcedureServer({ ...procedureServerOptions(policy, registryOf()), clock });
}

let sent = 0;
/** A call of a procedure: with the token of a tenant (a network call), or without credentials (a call of this process). */
function call(server: ProcedureServer, tenant: string | undefined, procedure: string): Promise<ServerResponse<unknown>> {
  return server.handle({
    id: `call-${++sent}`,
    method: pathToMethod(["notes", procedure]),
    payload: {},
    metadata: {},
    ...(tenant !== undefined ? { credentials: { bearer: `tok-${tenant}` } } : {}),
  });
}

/** The type of the status of a response: success, or the code of its error. */
function outcome(response: ServerResponse<unknown>): string {
  return response.status.type === "success" ? "ok" : String(response.status.code);
}

describe("the limits of the calls of a server (CLI-40)", () => {
  it("refuses the writes of a tenant above the limit with RATE_LIMITED and the wait, and does not run them", async () => {
    const clock = fakeClock();
    const server = serverOf([WRITES_PER_TENANT], clock);
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    const refused = await call(server, "acme", "write");
    expect(refused.status).toMatchObject({ type: "error", code: "RATE_LIMITED", retryable: true });
    // The wait in milliseconds, and the cause: the key used its limit
    expect(refused.metadata).toEqual({ "retry-after": 60_000, reason: "limit" });
    expect(refused.status.type === "error" ? refused.status.message : "").toContain("notes.writes");
    expect(runs["write"]).toBe(2);

    // The window moves with the clock: half a minute later, the wait is half a minute
    await clock.advance(30_000);
    expect((await call(server, "acme", "write")).metadata).toEqual({ "retry-after": 30_000, reason: "limit" });
    // One minute after the first writes, the tenant can write again
    await clock.advance(30_000);
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect(runs["write"]).toBe(3);
  });

  it("keeps a bucket for each tenant, and a limit of the writes does not limit the reads", async () => {
    const server = serverOf([WRITES_PER_TENANT]);
    for (let n = 0; n < 2; n++) expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect(outcome(await call(server, "acme", "write"))).toBe("RATE_LIMITED");
    // The other tenant has its own bucket
    expect(outcome(await call(server, "beta", "write"))).toBe("ok");
    expect(outcome(await call(server, "beta", "write"))).toBe("ok");
    expect(outcome(await call(server, "beta", "write"))).toBe("RATE_LIMITED");
    // The reads change nothing, so the limit of the writes does not cover them
    for (let n = 0; n < 5; n++) expect(outcome(await call(server, "acme", "read"))).toBe("ok");
    expect(runs).toEqual({ write: 4, read: 5 });
    // A call of this process has no principal, so no tenant: the limit does not cover it
    for (let n = 0; n < 3; n++) expect(outcome(await call(server, undefined, "write"))).toBe("ok");
  });

  it("refills a token bucket on the clock: a burst, then one call for each interval", async () => {
    const clock = fakeClock();
    const bucket: CallLimit = {
      ...WRITES_PER_TENANT,
      name: "notes.bucket",
      policy: { type: "token-bucket", rate: { value: 1, unit: "count/s" }, burst: count(2) },
    };
    const server = serverOf([bucket], clock);
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect((await call(server, "acme", "write")).metadata).toEqual({ "retry-after": 1000, reason: "limit" });
    await clock.advance(1000);
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect((await call(server, "acme", "write")).metadata).toEqual({ "retry-after": 1000, reason: "limit" });
  });

  it("takes the key from the principal, the route, a list of parts or a function", async () => {
    const one = ONE_EACH_MINUTE;

    // The route: each procedure has its own bucket, for all the callers
    const byRoute = serverOf([{ ...one, name: "by-route", key: "route" }]);
    expect(outcome(await call(byRoute, "acme", "read"))).toBe("ok");
    expect(outcome(await call(byRoute, "beta", "read"))).toBe("RATE_LIMITED");
    expect(outcome(await call(byRoute, "beta", "write"))).toBe("ok");

    // The principal and the route: a bucket for each pair
    const byPair = serverOf([{ ...one, name: "by-pair", key: ["principal", "route"] }]);
    expect(outcome(await call(byPair, "acme", "read"))).toBe("ok");
    expect(outcome(await call(byPair, "acme", "read"))).toBe("RATE_LIMITED");
    expect(outcome(await call(byPair, "acme", "write"))).toBe("ok");
    expect(outcome(await call(byPair, "beta", "read"))).toBe("ok");

    // A function: here, only the calls of this process, in one bucket
    const local = serverOf([{ ...one, name: "local", key: (facts) => (facts.principal === undefined ? "this process" : undefined) }]);
    expect(outcome(await call(local, undefined, "read"))).toBe("ok");
    expect(outcome(await call(local, undefined, "write"))).toBe("RATE_LIMITED");
    // A call whose key has no value is outside the limit
    for (let n = 0; n < 3; n++) expect(outcome(await call(local, "acme", "read"))).toBe("ok");
  });

  it("covers only the given routes, or the calls of a function", async () => {
    const one = ONE_EACH_MINUTE;
    const routes = serverOf([{ ...one, name: "routes", covers: { routes: ["notes.write"] } }]);
    expect(outcome(await call(routes, "acme", "write"))).toBe("ok");
    expect(outcome(await call(routes, "acme", "write"))).toBe("RATE_LIMITED");
    // notes.other writes too, but the limit names only notes.write
    for (let n = 0; n < 3; n++) expect(outcome(await call(routes, "acme", "other"))).toBe("ok");

    const prefix = serverOf([{ ...one, name: "prefix", covers: { routes: ["notes.*"], writes: false } }]);
    expect(outcome(await call(prefix, "acme", "read"))).toBe("ok");
    expect(outcome(await call(prefix, "acme", "read"))).toBe("RATE_LIMITED");
    expect(outcome(await call(prefix, "acme", "write"))).toBe("ok");
    expect(outcome(await call(prefix, "acme", "write"))).toBe("ok");

    const chosen = serverOf([{ ...one, name: "chosen", covers: (facts) => facts.route === "notes.other" }]);
    expect(outcome(await call(chosen, "acme", "other"))).toBe("ok");
    expect(outcome(await call(chosen, "acme", "other"))).toBe("RATE_LIMITED");
    expect(outcome(await call(chosen, "acme", "write"))).toBe("ok");
    expect(outcome(await call(chosen, "acme", "write"))).toBe("ok");
  });

  it("gives each limit as a keyed limiter with its spec, for the declaration of the service", () => {
    const server = serverOf([
      WRITES_PER_TENANT,
      { ...WRITES_PER_TENANT, name: "pairs", key: ["principal", "route"] },
      { ...WRITES_PER_TENANT, name: "custom", key: () => "one", keyName: "the app" },
      { ...WRITES_PER_TENANT, name: "function", key: () => "one" },
    ]);
    const limiters = server.limiters();
    expect(limiters.map((limiter) => [limiter.name, limiter.spec.key])).toEqual([
      ["notes.writes", "tenant"],
      ["pairs", "principal+route"],
      ["custom", "the app"],
      ["function", "call"],
    ]);
    expect(limiters[0]?.spec).toEqual({
      key: "tenant",
      policy: WRITES_PER_TENANT.policy,
      store: { kind: "local" },
      evict: { maxKeys: count(100) },
    });
    // Without the option, the server limits nothing and has no limiter
    expect(serverOf([]).limiters()).toEqual([]);
    expect(new ProcedureServer({ registry: registryOf() }).limiters()).toEqual([]);
  });

  it("follows onStoreFailure of a shared store: closed refuses with the cause store, open lets the call in", async () => {
    const down: LimiterStore = {
      kind: "shared",
      take: () => {
        throw new Error("the store is down");
      },
    };
    const shared = (onStoreFailure: "open" | "closed"): CallLimit => ({ ...WRITES_PER_TENANT, store: { kind: "shared", dependency: "redis", onStoreFailure } });

    const closed = serverOf([shared("closed")], fakeClock(), { redis: down });
    const refused = await call(closed, "acme", "write");
    expect(refused.status).toMatchObject({ type: "error", code: "RATE_LIMITED", retryable: true });
    // The wait is the longest wait of the policy: one window. The failure stays on the server.
    expect(refused.metadata).toEqual({ "retry-after": 60_000, reason: "store" });
    expect(refused.status.type === "error" ? refused.status.message : "").not.toContain("down");
    expect(runs["write"]).toBeUndefined();

    const open = serverOf([shared("open")], fakeClock(), { redis: down });
    expect(outcome(await call(open, "acme", "write"))).toBe("ok");
  });

  it("refuses a limit without its shared store, two limits with one name, and a spec with a problem", () => {
    const shared: CallLimit = { ...WRITES_PER_TENANT, store: { kind: "shared", dependency: "redis", onStoreFailure: "closed" } };
    expect(() => serverOf([shared])).toThrow(/shared store redis, and limitStores has no store with that name/);
    expect(() => serverOf([WRITES_PER_TENANT, WRITES_PER_TENANT])).toThrow(/Two limits have the name notes.writes/);
    expect(() => serverOf([{ ...WRITES_PER_TENANT, evict: {} as never }])).toThrow(/evict.maxKeys/);
    expect(() => serverOf([{ ...WRITES_PER_TENANT, key: [] }])).toThrow(/one part or more/);
  });

  it("answers INTERNAL_ERROR when a key function fails, and runs nothing", async () => {
    const broken = serverOf([
      {
        ...WRITES_PER_TENANT,
        key: () => {
          throw new Error("the key is broken");
        },
      },
    ]);
    const response = await call(broken, "acme", "write");
    expect(response.status).toMatchObject({ type: "error", code: "INTERNAL_ERROR", retryable: false });
    expect(response.status.type === "error" ? response.status.message : "").toContain("the key is broken");
    expect(runs["write"]).toBeUndefined();
  });

  it("goes from the host policy to the options of the server, and only when given", () => {
    const store: LimiterStore = { kind: "shared", take: () => ({ allowed: true, remaining: 1 }) };
    expect(procedureServerOptions(hostPolicy({ limits: [WRITES_PER_TENANT], limitStores: { redis: store } }))).toMatchObject({
      limits: [WRITES_PER_TENANT],
      limitStores: { redis: store },
    });
    const without = procedureServerOptions(hostPolicy({}));
    expect("limits" in without || "limitStores" in without).toBe(false);
    expect("limits" in hostPolicy({ limits: [] })).toBe(false);
  });
});
