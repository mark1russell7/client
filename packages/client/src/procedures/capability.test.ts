/**
 * Invocation capabilities (packages/documentation/CAPABILITIES-2026-10.md): the narrowing, the
 * admission, the nested calls, the interceptors, the resources, the output filter, the
 * explanations, the static check of the declarations and the MCP hints.
 */

import { describe, it, expect } from "vitest";
import {
  TIMEOUT_METADATA_KEY,
  UNLIMITED_CAPABILITY,
  capabilityRefusal,
  checkEffects,
  explainInvocation,
  ladder,
  narrowCapability,
  toolHints,
} from "./capability.js";
import { InvocationError, invokePath, outputItems, outputValue, type Interceptor, type InvokeOptions } from "./invoke.js";
import { ProcedureRegistry } from "./registry.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { coreProcedures, allCoreProcedures } from "./core/index.js";
import { createRegistry } from "./module.js";
import { RUNS_REFS_TAG } from "./ref.js";
import { metaProcedures } from "./define-procedure.js";
import type { AnyProcedure, Capability, Effects, ProcedureContext } from "./types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { hostPolicy, procedureServerOptions } from "../server/host-policy.js";
import { timeoutInterceptor } from "./interceptors.js";
import { Client } from "../client/client.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import type { Message, ResponseItem, Transport } from "../client/types.js";

type Level = "public" | "shared" | "private";
const order = ladder<Level>(["public", "shared", "private"]);

function proc(path: string[], handler: (input: unknown, ctx: ProcedureContext) => unknown, metadata: Record<string, unknown> = {}): AnyProcedure {
  return defineProcedure({ path, input: outputSchema<unknown>(), output: outputSchema<unknown>(), metadata, handler }) as AnyProcedure;
}

const READS_FS: Effects = { reads: ["fs"], writes: [] };
const WRITES_FS: Effects = { reads: ["fs"], writes: ["fs"] };

/** A registry with the control flow, a reader, a writer, a procedure without effects and a caller of each. */
function makeRegistry(log: string[] = []): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  for (const procedure of coreProcedures) registry.register(procedure);
  registry.register(proc(["files", "read"], () => { log.push("read"); return "content"; }, { effects: READS_FS }));
  registry.register(proc(["files", "write"], () => { log.push("write"); return "written"; }, { effects: WRITES_FS }));
  registry.register(proc(["files", "unknown"], () => { log.push("unknown"); return "?"; }));
  // A procedure of code that declares its effects and uses a helper that declares none
  registry.register(
    proc(["files", "summary"], (_input, ctx) => ctx.client.call(["files", "unknown"], {}), {
      effects: READS_FS,
      calls: ["files.unknown"],
    })
  );
  // The same caller, but it narrows its nested call
  registry.register(
    proc(["files", "narrowing"], (_input, ctx) => ctx.client.call(["files", "unknown"], {}, { narrow: { effects: { writes: [] } } }), {
      effects: READS_FS,
      calls: ["files.unknown"],
    })
  );
  // A procedure that shows its capability and its resources
  registry.register(
    proc(["show", "capability"], (_input, ctx) => ({ capability: ctx.capability, resources: ctx.resources }), { effects: { reads: [], writes: [] } })
  );
  // A procedure of code that calls show.capability with a lower clearance
  registry.register(
    proc(["show", "lower"], (_input, ctx) => ctx.client.call(["show", "capability"], {}, { narrow: { clearance: "public" } }), {
      effects: { reads: [], writes: [] },
      calls: ["show.capability"],
    })
  );
  // A stream of three records with clearances
  registry.register(
    proc(
      ["records", "list"],
      async function* () {
        yield { id: 1, level: "public" };
        yield { id: 2, level: "private" };
        yield { id: 3, level: "shared" };
      },
      { effects: { reads: ["records"], writes: [] } }
    )
  );
  return registry;
}

async function run(registry: ProcedureRegistry, path: string[], input: unknown, options: InvokeOptions = {}): Promise<unknown> {
  return outputValue(await invokePath(path, input, { registry, ...options }), path);
}

async function refusal(promise: Promise<unknown>): Promise<InvocationError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(InvocationError);
  return error as InvocationError;
}

const READ_ONLY: Capability = narrowCapability(undefined, { effects: { writes: [] } });

describe("ladder", () => {
  it("orders the values and gives the lower one as the meet", () => {
    expect(order.leq("public", "private")).toBe(true);
    expect(order.leq("private", "shared")).toBe(false);
    expect(order.meet("private", "shared")).toBe("shared");
    expect(() => order.leq("public", "secret" as Level)).toThrow(/Not a clearance value/);
  });
});

describe("narrowCapability", () => {
  it("gives the lower clearance, and never a higher one", () => {
    const base = narrowCapability<Level>(undefined, { clearance: "shared" });
    expect(narrowCapability(base, { clearance: "public" }, order).clearance).toBe("public");
    expect(narrowCapability(base, { clearance: "private" }, order).clearance).toBe("shared");
  });

  it("needs an order for two different clearances", () => {
    const base = narrowCapability<Level>(undefined, { clearance: "shared" });
    expect(() => narrowCapability(base, { clearance: "public" })).toThrow(/clearance order/);
    expect(narrowCapability(base, { clearance: "shared" }).clearance).toBe("shared");
  });

  it("intersects the permitted effects, so a request for more has no effect", () => {
    const narrowed = narrowCapability(READ_ONLY, { effects: { writes: "any", reads: ["fs", "network"] } });
    expect(narrowed.effects).toEqual({ reads: ["fs", "network"], writes: [] });
    const fsOnly = narrowCapability(narrowed, { effects: { reads: ["fs"] } });
    expect(fsOnly.effects?.reads).toEqual(["fs"]);
    expect(narrowCapability(fsOnly, { effects: { reads: "any" } }).effects?.reads).toEqual(["fs"]);
  });

  it("keeps destructive: false, and the earlier deadline", () => {
    const base = narrowCapability(undefined, { effects: { destructive: false }, timeoutMs: 1000 }, undefined, 0);
    const later = narrowCapability(base, { effects: { destructive: true }, timeoutMs: 5000 }, undefined, 0);
    expect(later.effects?.destructive).toBe(false);
    expect(later.deadline).toBe(1000);
    expect(narrowCapability(base, { timeoutMs: 10 }, undefined, 0).deadline).toBe(10);
  });

  it("keeps the deadline when the time asked for is not a number of milliseconds", () => {
    const base = narrowCapability(undefined, { timeoutMs: 1000 }, undefined, 0);
    for (const timeoutMs of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(narrowCapability(base, { timeoutMs }, undefined, 0).deadline).toBe(1000);
      expect(narrowCapability(undefined, { timeoutMs }, undefined, 0).deadline).toBeUndefined();
    }
  });

  it("gives a frozen capability", () => {
    expect(Object.isFrozen(READ_ONLY)).toBe(true);
    expect(Object.isFrozen(READ_ONLY.effects)).toBe(true);
  });
});

describe("capabilityRefusal", () => {
  const registry = makeRegistry();
  const get = (key: string): AnyProcedure => registry.get(key.split("."))!;

  it("permits everything without a capability or without permitted effects", () => {
    expect(capabilityRefusal(get("files.write"), undefined)).toBeUndefined();
    expect(capabilityRefusal(get("files.unknown"), UNLIMITED_CAPABILITY)).toBeUndefined();
  });

  it("permits a reader and refuses a writer and an undeclared procedure under read only", () => {
    expect(capabilityRefusal(get("files.read"), READ_ONLY)).toBeUndefined();
    expect(capabilityRefusal(get("files.write"), READ_ONLY)).toMatchObject({ reason: "effects-exceeded" });
    expect(capabilityRefusal(get("files.unknown"), READ_ONLY)).toMatchObject({ reason: "effects-undeclared" });
  });

  it("compares the reads with the permitted reads", () => {
    const networkOnly = narrowCapability(undefined, { effects: { reads: ["network"] } });
    expect(capabilityRefusal(get("files.read"), networkOnly)?.message).toContain("files.read reads fs");
  });

  it("refuses a procedure that writes by default under destructive: false", () => {
    const additive = narrowCapability(undefined, { effects: { destructive: false } });
    expect(capabilityRefusal(get("files.write"), additive)).toMatchObject({ reason: "effects-exceeded" });
    expect(capabilityRefusal(get("files.read"), additive)).toBeUndefined();
  });

  it("refuses a call after its deadline", () => {
    const capability = narrowCapability(undefined, { timeoutMs: 10 }, undefined, 0);
    expect(capabilityRefusal(get("files.read"), capability, 20)).toMatchObject({ reason: "deadline" });
  });
});

describe("invocations under a capability", () => {
  it("refuses a call of a host with FORBIDDEN and the reason, before the handler", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    const error = await refusal(run(registry, ["files", "write"], {}, { capability: READ_ONLY }));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.reason).toBe("effects-exceeded");
    expect(log).toEqual([]);
    expect(await run(registry, ["files", "read"], {}, { capability: READ_ONLY })).toBe("content");
  });

  it("examines each nested call of control flow, because its caller chose the refs", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    const chain = { steps: [{ $proc: ["files", "read"], input: {} }, { $proc: ["files", "write"], input: {} }] };
    const error = await refusal(run(registry, ["client", "chain"], chain, { capability: READ_ONLY }));
    expect(error.code).toBe("FORBIDDEN");
    expect(log).toEqual(["read"]);
  });

  it("lets a procedure of code with declared effects answer for its nested calls", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    expect(await run(registry, ["files", "summary"], {}, { capability: READ_ONLY })).toBe("?");
    expect(log).toEqual(["unknown"]);
  });

  it("examines a nested call that the caller narrows", async () => {
    const registry = makeRegistry();
    const error = await refusal(run(registry, ["files", "narrowing"], {}));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.reason).toBe("effects-undeclared");
  });

  it("lets an interceptor narrow the capability, but not widen it", async () => {
    const registry = makeRegistry();
    const widen: Interceptor = (_invocation, next) => next({ capability: { effects: { writes: "any" } } });
    const error = await refusal(run(registry, ["files", "write"], {}, { capability: READ_ONLY, interceptors: [widen] }));
    expect(error.code).toBe("FORBIDDEN");
    const narrow: Interceptor = (_invocation, next) => next({ capability: { effects: { writes: [] } } });
    expect((await refusal(run(registry, ["files", "write"], {}, { interceptors: [narrow] }))).code).toBe("FORBIDDEN");
  });

  it("gives the capability to the handler and to the nested calls, and a narrower clearance on request", async () => {
    const registry = makeRegistry();
    const capability = narrowCapability<Level>(undefined, { clearance: "private" });
    const own = (await run(registry, ["show", "capability"], {}, { capability, clearanceOrder: order })) as { capability: Capability };
    expect(own.capability.clearance).toBe("private");
    expect(Object.isFrozen(own.capability)).toBe(true);
    const nested = (await run(registry, ["show", "lower"], {}, { capability, clearanceOrder: order })) as { capability: Capability };
    expect(nested.capability.clearance).toBe("public");
  });

  it("gives the resources of the host for the capability", async () => {
    const registry = makeRegistry();
    const capability = narrowCapability<Level>(undefined, { clearance: "shared" });
    const result = (await run(registry, ["show", "capability"], {}, {
      capability,
      resources: (invocation) => ({ view: `records up to ${String(invocation.capability.clearance)}` }),
    })) as { resources: unknown };
    expect(result.resources).toEqual({ view: "records up to shared" });
    const none = (await run(registry, ["show", "capability"], {})) as { resources: unknown };
    expect(none.resources).toEqual({});
  });

  it("drops the stream items that the output filter refuses, only at the host", async () => {
    const registry = makeRegistry();
    const capability = narrowCapability<Level>(undefined, { clearance: "shared" });
    const admitItem = (item: unknown, invocation: { capability: Capability }): boolean =>
      order.leq((item as { level: Level }).level, invocation.capability.clearance as Level);
    const items: unknown[] = [];
    for await (const item of outputItems(await invokePath(["records", "list"], {}, { registry, capability, admitItem }))) items.push(item);
    expect(items.map((item) => (item as { id: number }).id)).toEqual([1, 3]);
  });

  it("waits for an output filter that gives a promise (a lookup)", async () => {
    const registry = makeRegistry();
    const capability = narrowCapability<Level>(undefined, { clearance: "shared" });
    const admitItem = async (item: unknown, invocation: { capability: Capability }): Promise<boolean> => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return order.leq((item as { level: Level }).level, invocation.capability.clearance as Level);
    };
    const items: unknown[] = [];
    for await (const item of outputItems(await invokePath(["records", "list"], {}, { registry, capability, admitItem }))) items.push(item);
    expect(items.map((item) => (item as { id: number }).id)).toEqual([1, 3]);
    const error = await refusal(run(registry, ["files", "read"], {}, { admitItem: async () => false }));
    expect(error.reason).toBe("clearance");
  });

  it("refuses a single value that the output filter refuses", async () => {
    const registry = makeRegistry();
    const error = await refusal(run(registry, ["files", "read"], {}, { admitItem: () => false }));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.reason).toBe("clearance");
  });
});

describe("explainInvocation", () => {
  it("tells the decision and the reason without a call", () => {
    const registry = makeRegistry();
    expect(explainInvocation(["files", "read"], READ_ONLY, registry).permitted).toBe(true);
    expect(explainInvocation(["files", "write"], READ_ONLY, registry)).toMatchObject({ permitted: false, reason: "effects-exceeded" });
    expect(explainInvocation(["no", "such"], READ_ONLY, registry)).toMatchObject({ permitted: false, reason: "not-found" });
  });
});

describe("checkEffects", () => {
  it("finds a declaration that does not include the effects of a callee", () => {
    const writer = proc(["a", "write"], () => 1, { effects: WRITES_FS });
    const reader = proc(["a", "reader"], () => 1, { effects: READS_FS, calls: ["a.write"] });
    const violations = checkEffects([writer, reader]);
    expect(violations.map((v) => v.message)).toEqual(["a.reader calls a.write: the declaration does not include fs in writes"]);
  });

  it("does not compare the flags: a caller that creates new files through a writer can be additive", () => {
    const write = proc(["fs", "write"], () => 1, { effects: { reads: [], writes: ["fs"] } });
    const create = proc(["lib", "new"], () => 1, { effects: { reads: ["fs"], writes: ["fs"], destructive: false }, calls: ["fs.write"] });
    expect(checkEffects([write, create])).toEqual([]);
  });

  it("does not compare the process mechanism: the caller declares what the program does", () => {
    const shell = proc(["shell", "run"], () => 1, { effects: { reads: [], writes: ["process"] } });
    const status = proc(["git", "status"], () => 1, { effects: READS_FS, calls: ["shell.run"] });
    expect(checkEffects([shell, status])).toEqual([]);
  });

  it("reports a callee without a declaration, and skips data-driven callers", () => {
    const helper = proc(["a", "helper"], () => 1);
    const caller = proc(["a", "caller"], () => 1, { effects: READS_FS, calls: ["a.*"] });
    const runner = proc(["a", "runner"], () => 1, { effects: READS_FS, calls: ["a.helper"], tags: [RUNS_REFS_TAG] });
    expect(checkEffects([helper, caller, runner]).map((v) => v.callee)).toEqual(["a.helper"]);
  });
});

describe("toolHints", () => {
  it("gives the MCP hints from the declared effects", () => {
    const registry = makeRegistry();
    expect(toolHints(registry.get(["files", "read"])!)).toEqual({ readOnlyHint: true, openWorldHint: false });
    expect(toolHints(registry.get(["files", "write"])!)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
    const fetcher = proc(["web", "fetch"], () => 1, { effects: { reads: ["network"], writes: [] } });
    expect(toolHints(fetcher).openWorldHint).toBe(true);
  });

  it("gives no hints without a declaration, or for control flow", () => {
    const registry = makeRegistry();
    expect(toolHints(registry.get(["files", "unknown"])!)).toEqual({});
    expect(toolHints(registry.get(["client", "chain"])!)).toEqual({});
  });
});

describe("the declarations of the core", () => {
  it("declares the effects of each procedure of the client module and of allCoreProcedures", () => {
    const undeclared = [...createRegistry().getAll(), ...allCoreProcedures]
      .filter((procedure) => (procedure.metadata as { effects?: unknown } | undefined)?.effects === undefined)
      .map((procedure) => procedure.path.join("."));
    expect(undeclared).toEqual([]);
  });

  it("gives the registry effects to procedure.define and procedure.delete, and read only to the others", () => {
    const registry = createRegistry();
    const effects = (key: string): unknown => (registry.get(key.split("."))!.metadata as { effects?: unknown }).effects;
    expect(effects("procedure.define")).toEqual({ reads: ["registry"], writes: ["registry"] });
    expect(effects("procedure.list")).toEqual({ reads: ["registry"], writes: [] });
    expect(effects("client.chain")).toEqual({ reads: [], writes: [] });
  });
});

describe("a host with a capability", () => {
  it("refuses a writer under readOnly with FORBIDDEN and the reason in the response", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    const server = new ProcedureServer(procedureServerOptions(hostPolicy({ readOnly: true }), registry));
    const response = await server.handle({ id: "1", method: { service: "files", operation: "write" }, payload: {}, metadata: {} });
    expect(response.status).toMatchObject({ type: "error", code: "FORBIDDEN" });
    expect(response.metadata).toEqual({ reason: "effects-exceeded" });
    expect(log).toEqual([]);
    const read = await server.handle({ id: "2", method: { service: "files", operation: "read" }, payload: {}, metadata: {} });
    expect(read.payload).toBe("content");
  });

  it("calculates the capability of each request, and never takes it from the request", async () => {
    const registry = makeRegistry();
    const policy = hostPolicy({
      capability: (request) => narrowCapability<Level>(undefined, { clearance: request.metadata["token"] === "owner" ? "private" : "public" }),
      clearanceOrder: order,
    });
    const server = new ProcedureServer(procedureServerOptions(policy, registry));
    const show = async (metadata: Record<string, unknown>): Promise<unknown> =>
      ((await server.handle({ id: "1", method: { service: "show", operation: "capability" }, payload: {}, metadata })).payload as { capability: Capability }).capability.clearance;
    expect(await show({ token: "owner" })).toBe("private");
    expect(await show({ token: "guest", capability: { clearance: "private" } })).toBe("public");
  });
});

describe("deadlines (phase C)", () => {
  it("gives the deadline of the timeout interceptor to the handler and to the nested calls", async () => {
    const registry = makeRegistry();
    const before = Date.now();
    const result = (await run(registry, ["show", "lower"], {}, {
      interceptors: [timeoutInterceptor({ ms: 5000 })],
      capability: narrowCapability<Level>(undefined, { clearance: "private" }),
      clearanceOrder: order,
    })) as { capability: Capability };
    expect(result.capability.deadline).toBeGreaterThanOrEqual(before + 5000);
    expect(result.capability.deadline).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it("refuses a call whose deadline passed, before the handler", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    const capability = narrowCapability(undefined, { timeoutMs: 0 }, undefined, Date.now() - 1);
    const error = await refusal(run(registry, ["files", "read"], {}, { capability }));
    expect(error.code).toBe("TIMEOUT");
    expect(log).toEqual([]);
  });

  it("ends a call at the deadline of its capability, without a timeout interceptor", async () => {
    const registry = makeRegistry();
    registry.register(proc(["slow", "wait"], (_input, ctx) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve("late"), 2000);
      ctx.signal?.addEventListener("abort", () => clearTimeout(timer));
    }), { effects: { reads: [], writes: [] } }));
    const error = await refusal(run(registry, ["slow", "wait"], {}, { capability: narrowCapability(undefined, { timeoutMs: 30 }) }));
    expect(error.code).toBe("TIMEOUT");
  });

  it("makes the deadline of a server earlier with the remaining time of the request, never later", async () => {
    const registry = makeRegistry();
    const server = new ProcedureServer({ registry, autoRegister: true, capability: narrowCapability(undefined, { timeoutMs: 60_000 }) });
    const deadlineOf = async (metadata: Record<string, unknown>): Promise<number> =>
      ((await server.handle({ id: "1", method: { service: "show", operation: "capability" }, payload: {}, metadata })).payload as { capability: Capability })
        .capability.deadline!;
    const now = Date.now();
    expect(await deadlineOf({ [TIMEOUT_METADATA_KEY]: 1000 })).toBeLessThanOrEqual(now + 1000 + 50);
    expect(await deadlineOf({ [TIMEOUT_METADATA_KEY]: 600_000 })).toBeLessThanOrEqual(now + 60_000 + 50);
  });
});

describe("a Client with a capability", () => {
  it("gives its capability to its local invocations and to their nested calls", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    const client = new Client({ transport: new LocalTransport({ registry }), capability: READ_ONLY }).useRegistry(registry);
    expect(await client.exec(["files", "read"], {})).toBe("content");
    const chain = { steps: [{ $proc: ["files", "write"], input: {} }] };
    const error = await refusal(client.exec(["client", "chain"], chain));
    expect(error.code).toBe("FORBIDDEN");
    expect(log).toEqual(["read"]);
  });

  it("runs a procedure that procedure.define made under readOnly, and examines each of its nested calls", async () => {
    const log: string[] = [];
    const registry = makeRegistry(log);
    for (const procedure of metaProcedures) registry.register(procedure);
    const writer = new Client({ transport: new LocalTransport({ registry }) }).useRegistry(registry);
    await writer.exec(["procedure", "define"], { path: ["defined", "read"], aggregation: { $proc: ["files", "read"], input: {} } });
    await writer.exec(["procedure", "define"], {
      path: ["defined", "write"],
      aggregation: { $proc: ["files", "write"], input: {} },
      // The metadata of a caller cannot claim fewer effects
      metadata: { description: "Writes", effects: { reads: [], writes: [] } },
    });
    expect(registry.get(["defined", "write"])!.metadata.effects).toEqual({ reads: [], writes: [] });

    const reader = new Client({ transport: new LocalTransport({ registry }), capability: READ_ONLY }).useRegistry(registry);
    expect(await reader.exec(["defined", "read"], {})).toBe("content");
    expect((await refusal(reader.exec(["defined", "write"], {}))).code).toBe("FORBIDDEN");
    expect(log).toEqual(["read"]);
  });

  it("sends the remaining time of its deadline with a remote call", async () => {
    let sent: Record<string, unknown> | undefined;
    const transport: Transport = {
      name: "capture",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        sent = message.metadata as Record<string, unknown>;
        yield { id: message.id, status: { type: "success", code: 200 }, payload: "remote" as TRes, metadata: {} };
      },
      close: async () => undefined,
    };
    const client = new Client({ transport, capability: narrowCapability(undefined, { timeoutMs: 5000 }) }).useRegistry(new ProcedureRegistry());
    expect(await client.exec(["remote", "thing"], {})).toBe("remote");
    expect(sent?.[TIMEOUT_METADATA_KEY]).toBeGreaterThan(4000);
    expect(sent?.[TIMEOUT_METADATA_KEY]).toBeLessThanOrEqual(5000);
  });
});
