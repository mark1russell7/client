/**
 * The limits of the calls of a server (CLI-40): keyed limiters of `@mark1russell7/service/limiter`
 * in the admission path, on the clock of the server.
 *
 * - A limit of the writes of each tenant refuses a write above the limit with `RATE_LIMITED`. The
 *   refusal is retryable, with the wait in `retry-after` and the cause in `reason`. The call does
 *   not run.
 * - A refusal with the cause `capacity` is `RATE_LIMITED`, not retryable, and has no wait.
 * - Each tenant has its own bucket. A limit of the writes does not limit the reads.
 * - The key is data (the principal, a claim, the route, a list of them) or a function. A call
 *   without a value of its key is outside the limit.
 * - A shared store follows `onStoreFailure`. A limit without its store, two limits with one name
 *   and a spec with a problem are refused at the start.
 * - A limit with `nested: true` takes the units of each nested call that it covers. A refused nested
 *   call gets the code, the wait and the metadata of a refusal at the door. A limit without the
 *   field counts the calls of a caller only, and the server writes a warning.
 * - An in-flight bound (CLI-132) holds a unit of a call until its value or its error, and a unit of
 *   a stream until its end or the stop of its reader. A later refusal gives back the unit. A failed
 *   release writes a warning, and the unit then counts until its lease ends. A seeded law of
 *   fast-check examines each order of starts and ends.
 * - Each test reads time only from a fake clock: no real sleeps.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import * as z from "zod";
import { fakeClock, type FakeClock } from "@mark1russell7/service/testing";
import { memoryStore, type LimiterStore } from "@mark1russell7/service/limiter";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { seconds } from "../duration.js";
import { ProcedureServer } from "./procedure-server.js";
import { hostPolicy, procedureServerOptions } from "./host-policy.js";
import { pathToMethod } from "./method.js";
import { rateLimitedResponse, type CallLimit, type LimitedCall } from "./limits.js";
import type { PrincipalOf, ServerResponse } from "./types.js";
import type { LogFields, Logger, LogLevel } from "../logger.js";
import { LOCAL_CREDENTIALS } from "./request-auth.js";

const WRITES = { reads: ["notes"], writes: ["notes"] };
const READS = { reads: ["notes"], writes: [] };

/** A count, as the policies of a limiter take it. */
const count = (value: number): { value: number; unit: string } => ({ value, unit: "count" });

/** The runs of each procedure: a refused call does not run. */
let runs: Record<string, number> = {};

/** The errors of the nested calls that `notes.fanout` kept. */
let nestedErrors: unknown[] = [];

/**
 * A procedure that writes `n` times with nested calls of `notes.write`. With `keepGoing`, it keeps
 * the code of each failed call in its output. Without it, the first error ends the call.
 */
const fanout = createProcedure()
  .path(["notes", "fanout"])
  .input(z.object({ n: z.number(), keepGoing: z.boolean().optional() }))
  .output(z.array(z.string()))
  .meta({ effects: WRITES })
  .handler(async (input, ctx) => {
    runs["fanout"] = (runs["fanout"] ?? 0) + 1;
    const outcomes: string[] = [];
    for (let n = 0; n < input.n; n++) {
      try {
        outcomes.push(await ctx.client.call<object, string>(["notes", "write"], {}));
      } catch (error) {
        if (input.keepGoing !== true) throw error;
        nestedErrors.push(error);
        outcomes.push(String((error as { code?: unknown }).code));
      }
    }
    return outcomes;
  })
  .build();

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
  return createRegistry({
    name: "limits-test",
    procedures: [procedure("write", WRITES), procedure("read", READS), procedure("other", WRITES), fanout, hold, feed, nest],
  });
}

/** The end of a held call: its value or its error. */
type HeldEnd = "value" | "error";

/** A gate of a held call: the call waits until the test opens it. */
interface Gate {
  readonly opened: Promise<HeldEnd>;
  readonly open: (end: HeldEnd) => void;
}

/** The gates of the held calls, by the id of the call. */
const gates = new Map<string, Gate>();

/** The ids of the held calls whose handler started. */
const started = new Set<string>();

/** The gate of a call: the test and the handler get the same gate, in each order. */
function gateOf(id: string): Gate {
  let gate = gates.get(id);
  if (gate === undefined) {
    let open: (end: HeldEnd) => void = () => {};
    const opened = new Promise<HeldEnd>((resolve) => {
      open = resolve;
    });
    gate = { opened, open };
    gates.set(id, gate);
  }
  return gate;
}

/** A call that runs until the test opens its gate, then gives its id or an error. */
const hold = createProcedure()
  .path(["notes", "hold"])
  .input(z.object({ id: z.string() }))
  .output(z.string())
  .meta({ effects: WRITES })
  .handler(async ({ id }) => {
    started.add(id);
    if ((await gateOf(id).opened) === "error") throw new Error("the held work failed");
    return id;
  })
  .build();

/** A stream that gives one item, waits until the test opens its gate, then gives the last item. */
const feed = createProcedure()
  .path(["notes", "feed"])
  .input(z.object({ id: z.string() }))
  .output(z.string())
  .meta({ effects: READS })
  .handler(
    (async ({ id }: { id: string }) =>
      (async function* () {
        started.add(id);
        yield "first";
        await gateOf(id).opened;
        yield "last";
      })()) as never,
  )
  .build();

/** A call whose nested call holds: the nested call has the id `<id>/inner`. */
const nest = createProcedure()
  .path(["notes", "nest"])
  .input(z.object({ id: z.string() }))
  .output(z.string())
  .meta({ effects: WRITES })
  .handler(async ({ id }, ctx) => ctx.client.call<{ id: string }, string>(["notes", "hold"], { id: `${id}/inner` }))
  .build();

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
function serverOf(
  limits: readonly CallLimit[],
  clock: FakeClock = fakeClock(),
  limitStores?: Readonly<Record<string, LimiterStore>>,
  logger: Logger = memoryLogger(),
): ProcedureServer {
  runs = {};
  nestedErrors = [];
  const policy = hostPolicy({ principalOf, limits, ...(limitStores ? { limitStores } : {}) });
  return new ProcedureServer({ ...procedureServerOptions(policy, registryOf()), clock, logger });
}

/** A line of the memory logger. */
interface LogLine {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: LogFields;
}

/** A logger that keeps each line in memory. */
function memoryLogger(): Logger & { readonly lines: LogLine[] } {
  const lines: LogLine[] = [];
  return {
    lines,
    log: (level, message, fields) => {
      lines.push({ level, message, fields });
    },
  };
}

let sent = 0;
/** A call of a procedure: with the token of a tenant (a network call), or with the local marker (a call of this process, CLI-1). */
function call(server: ProcedureServer, tenant: string | undefined, procedure: string, payload: unknown = {}): Promise<ServerResponse<unknown>> {
  return server.handle({
    id: `call-${++sent}`,
    method: pathToMethod(["notes", procedure]),
    payload,
    metadata: {},
    credentials: tenant !== undefined ? { bearer: `tok-${tenant}` } : LOCAL_CREDENTIALS,
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

  it("takes one unit of each limit in sequence, and a limit before a refusal keeps its unit", async () => {
    const calls: CallLimit = { ...ONE_EACH_MINUTE, name: "calls", policy: { type: "sliding-window", limit: count(2), window: seconds(60) } };
    const writes: CallLimit = { ...ONE_EACH_MINUTE, name: "writes", covers: { routes: ["notes.write"] } };
    const server = serverOf([calls, writes]);
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    // The limit of the writes refuses the second write, after the limit of the calls took its unit
    const second = await call(server, "acme", "write");
    expect(second.status.type === "error" ? second.status.message : "").toContain("The limit writes");
    // The limit of the calls kept that unit: a read is now above its limit of 2
    const read = await call(server, "acme", "read");
    expect(read.status.type === "error" ? read.status.message : "").toContain("The limit calls");
    expect(runs).toEqual({ write: 1 });
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

  it("gives a capacity refusal as PAYLOAD_TOO_LARGE that is not retryable, with its units and the capacity", () => {
    const response = rateLimitedResponse("1", { limit: "uploads", refused: { allowed: false, cause: "capacity", units: 5, capacity: 3 } });
    expect(response.status).toEqual({
      type: "error",
      code: "PAYLOAD_TOO_LARGE",
      message: "The limit uploads of the host refuses the call: it costs 5 units, over the capacity of 3",
      retryable: false,
    });
    expect(response.metadata).toEqual({ reason: "capacity", units: 5, capacity: 3 });
  });
});

describe("the cost of a call (CLI-122)", () => {
  /** The count of the list `items` of the payload of a call. */
  const itemsOf = (call: LimitedCall): number => {
    const items = (call.request.payload as { items?: unknown } | undefined)?.items;
    return Array.isArray(items) ? items.length : 0;
  };
  /** A payload with `n` items. */
  const items = (n: number): { items: string[] } => ({ items: Array.from({ length: n }, (_, index) => `s${String(index)}`) });
  /** A burst of 12 units for each tenant, and a cost of 1 + ceil(items / 50) for each write. */
  const BY_ITEMS: CallLimit = {
    ...WRITES_PER_TENANT,
    name: "notes.items",
    policy: { type: "token-bucket", rate: { value: 1, unit: "count/s" }, burst: count(12) },
    cost: (call) => 1 + Math.ceil(itemsOf(call) / 50),
  };

  it("refuses a call over the capacity with PAYLOAD_TOO_LARGE, the units and the capacity, and takes nothing", async () => {
    const server = serverOf([BY_ITEMS]);
    // 600 items cost 13 units, over the burst of 12
    const refused = await call(server, "acme", "write", items(600));
    expect(refused.status).toMatchObject({ type: "error", code: "PAYLOAD_TOO_LARGE", retryable: false });
    expect(refused.metadata).toEqual({ reason: "capacity", units: 13, capacity: 12 });
    expect(refused.status.type === "error" ? refused.status.message : "").toContain("notes.items");
    expect(runs["write"]).toBeUndefined();
    // The refusal took nothing: 500 items cost 11 of the 12 units
    expect(outcome(await call(server, "acme", "write", items(500)))).toBe("ok");
    // One unit is left: 1 item costs 2 units, thus the call waits for one unit
    expect((await call(server, "acme", "write", items(1))).metadata).toEqual({ "retry-after": 1000, reason: "limit" });
    // A call with no items costs 1 unit
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect(runs["write"]).toBe(2);
  });

  it("takes one unit for a limit with no cost, a fixed cost for each call, and refuses a fixed cost that is not a whole number of 1 or more", async () => {
    const server = serverOf([{ ...BY_ITEMS, cost: 5 }]);
    expect(outcome(await call(server, "acme", "write", items(600)))).toBe("ok");
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    // 10 of the 12 units are used: a third call of 5 units waits
    expect((await call(server, "acme", "write")).metadata).toMatchObject({ reason: "limit" });
    const { cost: _cost, ...noCost } = BY_ITEMS;
    const one = serverOf([noCost]);
    for (let index = 0; index < 12; index++) expect(outcome(await call(one, "acme", "write", items(600)))).toBe("ok");
    expect((await call(one, "acme", "write")).metadata).toMatchObject({ reason: "limit" });
    for (const cost of [0, 1.5, -1, Number.NaN]) expect(() => serverOf([{ ...BY_ITEMS, cost }])).toThrow(/The cost of the limit notes.items is a whole number of 1 or more/);
  });
});

describe("the limits of the nested calls", () => {
  /** Two writes of each tenant in each minute, for the route notes.write only: the route notes.fanout is outside the limit. */
  const NESTED_WRITES: CallLimit = {
    name: "notes.write",
    key: { claim: "tenant" },
    covers: { routes: ["notes.write"] },
    policy: { type: "sliding-window", limit: count(2), window: seconds(60) },
    store: { kind: "local" },
    evict: { maxKeys: count(100) },
    nested: true,
  };

  /** The output of a call, or the code of its error. */
  const outputOf = (response: ServerResponse<unknown>): unknown => (response.status.type === "success" ? response.payload : response.status.code);

  it("takes a unit for each nested call that a limit with nested: true covers, and refuses the calls above the limit", async () => {
    const server = serverOf([NESTED_WRITES]);
    expect(outputOf(await call(server, "acme", "fanout", { n: 5, keepGoing: true }))).toEqual(["write", "write", "RATE_LIMITED", "RATE_LIMITED", "RATE_LIMITED"]);
    expect(runs).toEqual({ fanout: 1, write: 2 });
    // The error of a refused nested call has the parts of a refusal at the door
    expect(nestedErrors[0]).toMatchObject({ code: "RATE_LIMITED", retryable: true, retryAfterMs: 60_000, limitMetadata: { "retry-after": 60_000, reason: "limit" } });
    expect((nestedErrors[0] as Error).message).toBe("The limit notes.write of the host refuses the nested call of notes.write (limit): retry after 60 s");
    // The calls of a caller and the nested calls use one bucket for each tenant
    expect(outcome(await call(server, "acme", "write"))).toBe("RATE_LIMITED");
    expect(outputOf(await call(server, "beta", "fanout", { n: 1 }))).toEqual(["write"]);
  });

  it("gives the caller the refusal of a nested call with the code, the wait and the cause", async () => {
    const clock = fakeClock();
    const server = serverOf([NESTED_WRITES], clock);
    const refused = await call(server, "acme", "fanout", { n: 3 });
    expect(refused.status).toMatchObject({ type: "error", code: "RATE_LIMITED", retryable: true });
    expect(refused.metadata).toEqual({ "retry-after": 60_000, reason: "limit" });
    expect(runs["write"]).toBe(2);
    // After the window, the nested calls run again
    await clock.advance(60_000);
    expect(outputOf(await call(server, "acme", "fanout", { n: 2 }))).toEqual(["write", "write"]);
  });

  it("gives a nested call over the capacity PAYLOAD_TOO_LARGE with the units and the capacity, and does not run it", async () => {
    const server = serverOf([{ ...NESTED_WRITES, cost: 5 }]);
    const refused = await call(server, "acme", "fanout", { n: 1 });
    expect(refused.status).toMatchObject({ type: "error", code: "PAYLOAD_TOO_LARGE", retryable: false });
    expect(refused.metadata).toEqual({ reason: "capacity", units: 5, capacity: 2 });
    expect(runs["write"]).toBeUndefined();
  });

  it("gives the cover, the key and the cost the depth and the input of each call", async () => {
    const seen: { route: string; depth: number; input: unknown }[] = [];
    const covers = (limited: LimitedCall): boolean => {
      seen.push({ route: limited.route, depth: limited.depth, input: limited.input });
      return true;
    };
    const server = serverOf([{ ...NESTED_WRITES, covers }]);
    expect(outcome(await call(server, "acme", "fanout", { n: 1 }))).toBe("ok");
    expect(seen).toEqual([
      { route: "notes.fanout", depth: 0, input: { n: 1 } },
      { route: "notes.write", depth: 1, input: {} },
    ]);
  });

  it("counts the calls of a caller only for a limit without nested: true, and warns one time for a limit without the field", async () => {
    const logger = memoryLogger();
    const { nested: _nested, ...withoutField } = NESTED_WRITES;
    const server = serverOf([withoutField, { ...NESTED_WRITES, name: "old", nested: false }], fakeClock(), undefined, logger);
    expect(outputOf(await call(server, "acme", "fanout", { n: 5 }))).toEqual(["write", "write", "write", "write", "write"]);
    expect(runs["write"]).toBe(5);
    // The calls of the caller still take their units
    for (let n = 0; n < 2; n++) expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    expect(outcome(await call(server, "acme", "write"))).toBe("RATE_LIMITED");
    expect(logger.lines).toEqual([
      {
        level: "warn",
        message:
          "The limit notes.write counts the calls of a caller only, not their nested calls. @procedures/client 0.65.0 counts the nested calls too. " +
          "Set nested: true to count them, or nested: false to keep this rule.",
        fields: { limit: "notes.write" },
      },
    ]);
  });

  it("refuses a nested call with INTERNAL_ERROR when the key function of a limit throws, and does not run it", async () => {
    const key = (limited: LimitedCall): string => {
      if (limited.depth > 0) throw new Error("no key");
      return "key";
    };
    const server = serverOf([{ ...NESTED_WRITES, key }]);
    const refused = await call(server, "acme", "fanout", { n: 1 });
    expect(refused.status).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
    expect(refused.status.type === "error" ? refused.status.message : "").toContain("cannot admit the nested call of notes.write: no key");
    expect(runs["write"]).toBeUndefined();
  });
});

describe("the check of the field nested", () => {
  it("refuses a value of nested that is not true, false or absent at the start", () => {
    const limit = { ...WRITES_PER_TENANT, nested: "true" } as unknown as CallLimit;
    expect(() => serverOf([limit])).toThrow('The field nested of the limit notes.writes is true, false or absent, not "true"');
  });
});

/** The runs of the law of the in-flight bound: `FC_RUNS` sets their count, and `FC_SEED` sets the seed of fast-check. */
const RUNS = Number(process.env["FC_RUNS"] ?? 100);
const SEED = Number(process.env["FC_SEED"] ?? 132);

/** The count of the ids of the held calls. */
let heldCount = 0;

/** This function gives a new id of a held call. */
const heldId = (): string => `held-${++heldCount}`;

/** This function gives the event loop turns until `done` is true. It fails after 1000 turns, and it reads no clock. */
async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 1000 && !done(); turn++) await new Promise<void>((resolve) => setImmediate(resolve));
  expect(done()).toBe(true);
}

/** An in-flight bound of `limit` calls of each tenant, for each call. The lease is one minute, and a refusal waits 5 seconds. */
function inFlight(limit: number, rest: Partial<CallLimit> = {}): CallLimit {
  return {
    name: "notes.in-flight",
    key: { claim: "tenant" },
    policy: { type: "in-flight", limit: count(limit), lease: seconds(60), retryAfter: seconds(5) },
    store: { kind: "local" },
    evict: { maxKeys: count(100) },
    nested: false,
    ...rest,
  };
}

/** The end of a call in flight in the law. A stream reads to its end, stops after its first item, or stops before it. */
type End = "value" | "error" | "stop";

/** A step of the law: the start of a call or a stream of a tenant, or the end of one call in flight. */
type Step =
  | { readonly kind: "start"; readonly tenant: "acme" | "beta"; readonly shape: "call" | "stream" }
  | { readonly kind: "end"; readonly pick: number; readonly how: End };

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constant("start" as const),
    tenant: fc.constantFrom("acme" as const, "beta" as const),
    shape: fc.constantFrom("call" as const, "stream" as const),
  }),
  fc.record({ kind: fc.constant("end" as const), pick: fc.nat(), how: fc.constantFrom<End>("value", "error", "stop") }),
);

/** A call in flight in the model of the law, with the function that ends it. */
interface Live {
  readonly tenant: string;
  readonly end: (how: End) => Promise<void>;
}

describe("the in-flight limits of the calls (CLI-132)", () => {
  it("holds a unit until the value or the error of the call, and refuses a call above the bound", async () => {
    const server = serverOf([inFlight(2)]);
    const [a, b, c] = [heldId(), heldId(), heldId()];
    const first = call(server, "acme", "hold", { id: a });
    const second = call(server, "acme", "hold", { id: b });
    await until(() => started.has(a) && started.has(b));
    const refused = await call(server, "acme", "hold", { id: c });
    expect(refused.status).toMatchObject({ type: "error", code: "RATE_LIMITED", retryable: true });
    expect(refused.metadata).toEqual({ "retry-after": 5_000, reason: "limit" });
    expect(started.has(c)).toBe(false);
    // The other tenant has its own count
    const other = heldId();
    gateOf(other).open("value");
    expect(outcome(await call(server, "beta", "hold", { id: other }))).toBe("ok");

    // The value and the error of a call each give back its unit
    gateOf(a).open("value");
    expect(outcome(await first)).toBe("ok");
    gateOf(b).open("error");
    expect((await second).status.type).toBe("error");
    const [d, e] = [heldId(), heldId()];
    const third = call(server, "acme", "hold", { id: d });
    const fourth = call(server, "acme", "hold", { id: e });
    await until(() => started.has(d) && started.has(e));
    expect(outcome(await call(server, "acme", "hold", { id: heldId() }))).toBe("RATE_LIMITED");
    gateOf(d).open("value");
    gateOf(e).open("value");
    expect([outcome(await third), outcome(await fourth)]).toEqual(["ok", "ok"]);
  });

  it("holds a unit of a stream until its end, or until its reader stops it, also before the first item", async () => {
    const server = serverOf([inFlight(1)]);
    const id = heldId();
    const response = await call(server, "acme", "feed", { id });
    const items = response.stream![Symbol.asyncIterator]();
    expect(await items.next()).toEqual({ done: false, value: "first" });
    // The stream holds the unit while its reader reads
    expect(outcome(await call(server, "acme", "read"))).toBe("RATE_LIMITED");
    gateOf(id).open("value");
    expect(await items.next()).toEqual({ done: false, value: "last" });
    expect(await items.next()).toEqual({ done: true, value: undefined });

    // A reader that stops before the first item gives back the unit
    const unread = await call(server, "acme", "feed", { id: heldId() });
    expect(outcome(unread)).toBe("ok");
    await unread.stream![Symbol.asyncIterator]().return?.(undefined);
    // A reader that stops after the first item gives it back too
    const stopped = (await call(server, "acme", "feed", { id: heldId() })).stream![Symbol.asyncIterator]();
    expect((await stopped.next()).value).toBe("first");
    await stopped.return?.(undefined);
    expect(outcome(await call(server, "acme", "read"))).toBe("ok");
  });

  it("gives back the in-flight unit of a call that a later limit refuses", async () => {
    const writes: CallLimit = { ...ONE_EACH_MINUTE, name: "writes", covers: { routes: ["notes.write"] }, nested: false };
    const server = serverOf([inFlight(1), writes]);
    expect(outcome(await call(server, "acme", "write"))).toBe("ok");
    const refused = await call(server, "acme", "write");
    expect(refused.status.type === "error" ? refused.status.message : "").toContain("The limit writes");
    // The in-flight bound has its unit again: a held call goes in
    const id = heldId();
    const running = call(server, "acme", "hold", { id });
    await until(() => started.has(id));
    gateOf(id).open("value");
    expect(outcome(await running)).toBe("ok");
  });

  it("writes a warning when a shared store cannot release, and the unit counts until its lease ends", async () => {
    const clock = fakeClock();
    const memory = memoryStore(clock);
    const failing: LimiterStore = {
      kind: "shared",
      take: (request) => memory.take(request),
      release: () => {
        throw new Error("the store is down");
      },
    };
    const logger = memoryLogger();
    const limit = inFlight(1, { store: { kind: "shared", dependency: "redis", onStoreFailure: "closed" } });
    const server = serverOf([limit], clock, { redis: failing }, logger);
    const id = heldId();
    gateOf(id).open("value");
    // The call ends with its value: the failure of the release stays on the server
    expect(outcome(await call(server, "acme", "hold", { id }))).toBe("ok");
    expect(logger.lines).toEqual([
      {
        level: "warn",
        message: "The limit notes.in-flight cannot release the units of a call: the store is down. The units count until their lease ends.",
        fields: { limit: "notes.in-flight" },
      },
    ]);
    // The unit counts until the end of its lease, one minute after the take
    expect(outcome(await call(server, "acme", "read"))).toBe("RATE_LIMITED");
    await clock.advance(60_000);
    expect(outcome(await call(server, "acme", "read"))).toBe("ok");
  });

  it("holds a unit of a nested call until the end of the nested call", async () => {
    const server = serverOf([inFlight(1, { covers: { routes: ["notes.hold"] }, nested: true })]);
    const outer = heldId();
    const running = call(server, "acme", "nest", { id: outer });
    await until(() => started.has(`${outer}/inner`));
    // The nested call holds the unit of the tenant: a call of the caller is above the bound
    expect(outcome(await call(server, "acme", "hold", { id: heldId() }))).toBe("RATE_LIMITED");
    gateOf(`${outer}/inner`).open("value");
    expect(await running).toMatchObject({ status: { type: "success" }, payload: `${outer}/inner` });
    const after = heldId();
    gateOf(after).open("value");
    expect(outcome(await call(server, "acme", "hold", { id: after }))).toBe("ok");
  });

  it("keeps at most the bound of each tenant in flight, and gives back each unit at its end, for each order of starts and ends", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), fc.array(step, { maxLength: 40 }), async (bound, steps) => {
        const server = serverOf([inFlight(bound)]);
        const live: Live[] = [];
        const inFlightOf = (tenant: string): number => live.filter((one) => one.tenant === tenant).length;

        // This function starts a call or a stream, and tells if the bound let it in
        const start = async (tenant: string, shape: "call" | "stream"): Promise<boolean> => {
          const id = heldId();
          if (shape === "stream") {
            const response = await call(server, tenant, "feed", { id });
            if (!response.stream) {
              expect(outcome(response)).toBe("RATE_LIMITED");
              return false;
            }
            const items = response.stream[Symbol.asyncIterator]();
            const end = async (how: End): Promise<void> => {
              if (how === "stop") {
                await items.return?.(undefined);
                return;
              }
              const seen: unknown[] = [(await items.next()).value];
              if (how === "error") {
                await items.return?.(undefined);
                return;
              }
              gateOf(id).open("value");
              for (let next = await items.next(); next.done !== true; next = await items.next()) seen.push(next.value);
              expect(seen).toEqual(["first", "last"]);
            };
            live.push({ tenant, end });
            return true;
          }
          const settled: { response?: ServerResponse<unknown> } = {};
          const response = call(server, tenant, "hold", { id }).then((value) => (settled.response = value));
          await until(() => started.has(id) || settled.response !== undefined);
          if (settled.response !== undefined) {
            expect(outcome(settled.response)).toBe("RATE_LIMITED");
            return false;
          }
          const end = async (how: End): Promise<void> => {
            gateOf(id).open(how === "error" ? "error" : "value");
            expect((await response).status.type).toBe(how === "error" ? "error" : "success");
          };
          live.push({ tenant, end });
          return true;
        };

        for (const one of steps) {
          if (one.kind === "start") {
            const room = inFlightOf(one.tenant) < bound;
            expect(await start(one.tenant, one.shape)).toBe(room);
          } else if (live.length > 0) {
            const [ended] = live.splice(one.pick % live.length, 1);
            await ended!.end(one.how);
          }
        }
        // After the end of each call, each tenant has its whole bound again
        for (const ended of live.splice(0)) await ended.end("value");
        for (const tenant of ["acme", "beta"]) {
          for (let n = 0; n < bound; n++) expect(await start(tenant, "call")).toBe(true);
          expect(await start(tenant, "call")).toBe(false);
        }
        for (const ended of live.splice(0)) await ended.end("value");
      }),
      { numRuns: RUNS, seed: SEED },
    );
  }, 60_000);
});
