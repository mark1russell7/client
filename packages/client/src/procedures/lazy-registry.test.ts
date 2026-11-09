/**
 * The lazy registry (roadmap O93): a call loads only the packages of its path. One load for
 * concurrent calls, a failed load with its cause and a retry, the paths outside the index, and
 * the dispatch points: `exec()`, `call()`, nested calls, control flow, a route and the server.
 * An eager registry does not change.
 */

import { describe, it, expect, vi } from "vitest";
import { Client } from "../client/client.js";
import { LocalTransport } from "../adapters/local/client/index.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { pathToMethod } from "../server/method.js";
import { defineProcedure } from "./define.js";
import { outputSchema } from "./core/schemas.js";
import { PROCEDURE_REGISTRY, RegistryError, loadAllIn, resolveIn } from "./registry.js";
import { clientModule, createLazyRegistry, createRegistry, defineModule, type LazyRegistryOptions } from "./module.js";
import { invokePath, outputValue } from "./invoke.js";
import { preloadRefPaths, RUNS_REFS_TAG } from "./ref.js";
import { REGISTRY_READ_EFFECTS } from "./effects.js";
import type { AnyProcedure, ProcedureContext, ProcedureModule } from "./types.js";
import type { ProcedureRegistry } from "./registry.js";

const proc = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown, metadata: Record<string, unknown> = {}): AnyProcedure =>
  defineProcedure({ path, input: outputSchema<unknown>(), output: outputSchema<unknown>(), metadata, handler: handler as never }) as AnyProcedure;

const alpha = defineModule("alpha", [
  proc(["alpha", "one"], () => "alpha-one"),
  // A nested call into the other package
  proc(["alpha", "callBeta"], (_input, ctx) => ctx.client.call(["beta", "one"], {})),
]);
const beta = defineModule("beta", [proc(["beta", "one"], () => "beta-one")]);
const INDEX = { "alpha.one": ["alpha"], "alpha.callBeta": ["alpha"], "beta.one": ["beta"] };

/** A lazy registry of the packages alpha and beta, with a count of the loads of each package. */
function lazy(overrides: Partial<LazyRegistryOptions> = {}): { registry: ProcedureRegistry; loads: Map<string, number>; warnings: string[] } {
  const loads = new Map<string, number>();
  const warnings: string[] = [];
  const modules: Record<string, ProcedureModule> = { alpha, beta };
  const registry = createLazyRegistry({
    index: INDEX,
    packages: ["alpha", "beta"],
    load: async (name) => {
      loads.set(name, (loads.get(name) ?? 0) + 1);
      // A real import gives the module after a turn of the event loop
      await new Promise((resolve) => setTimeout(resolve, 1));
      return modules[name];
    },
    warn: (message) => warnings.push(message),
    ...overrides,
  });
  return { registry, loads, warnings };
}

function clientOf(registry: ProcedureRegistry): Client {
  return new Client({ transport: new LocalTransport({ registry }), throwOnError: true }).useRegistry(registry);
}

describe("createLazyRegistry", () => {
  it("has the client module at once, and no package before a resolve", () => {
    const { registry, loads } = lazy();
    expect(registry.lazy).toBe(true);
    expect(registry.has(["client", "chain"])).toBe(true);
    expect(registry.getAll().length).toBe(clientModule.procedures.length);
    expect(registry.has(["alpha", "one"])).toBe(false);
    expect(loads.size).toBe(0);
  });

  it("starts one load for 10 concurrent resolves of one path", async () => {
    const { registry, loads } = lazy();
    const found = await Promise.all(Array.from({ length: 10 }, () => registry.resolve(["alpha", "one"])));
    expect(found.every((procedure) => procedure?.path.join(".") === "alpha.one")).toBe(true);
    expect(loads.get("alpha")).toBe(1);
    // Only the package of the path loads
    expect(loads.has("beta")).toBe(false);
    // A resolve after the load does not load again
    await registry.resolve(["alpha", "callBeta"]);
    expect(loads.get("alpha")).toBe(1);
  });

  it("fails a resolve with the load error as its cause, and tries the package again at the next resolve", async () => {
    let attempts = 0;
    const failure = new Error("Cannot find module 'mongodb'\nRequire stack: x");
    const { registry, warnings } = lazy({
      load: async (name) => {
        attempts += 1;
        if (attempts === 1) throw failure;
        return name === "alpha" ? alpha : beta;
      },
    });
    const error = await registry.resolve(["alpha", "one"]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).cause).toBe(failure);
    expect((error as Error).message).toBe("The procedure alpha.one did not load: the package alpha did not load: Cannot find module 'mongodb'");
    expect(warnings).toEqual(["the procedures of alpha did not load: Cannot find module 'mongodb'"]);
    // The failure is not cached
    expect((await registry.resolve(["alpha", "one"]))?.path).toEqual(["alpha", "one"]);
    expect(attempts).toBe(2);
  });

  it("loads each package for a path outside the index, with one warning for each path", async () => {
    const { registry, loads, warnings } = lazy({ index: { "alpha.one": ["alpha"] } });
    expect((await registry.resolve(["beta", "one"]))?.path).toEqual(["beta", "one"]);
    expect([...loads.keys()]).toEqual(["alpha", "beta"]);
    expect(await registry.resolve(["no", "such"])).toBeUndefined();
    expect(await registry.resolve(["no", "such"])).toBeUndefined();
    expect(warnings).toEqual(["the index has no package for beta.one: each package loads", "the index has no package for no.such: each package loads"]);
  });

  it("warns for at most 1000 paths outside the index, and tells that the next ones get no warning (audit 2026-11-08)", async () => {
    const { registry, warnings } = lazy({ index: {} });
    for (let n = 0; n < 1005; n++) await registry.resolve(["no", `such${n}`]);
    expect(warnings).toHaveLength(1000);
    expect(warnings[998]).toBe("the index has no package for no.such998: each package loads");
    expect(warnings[999]).toBe("the index has no package for no.such999: each package loads. The next paths with no package get no warning.");
  });

  it("loads the packages of a path one after the other when the index names two", async () => {
    const order: string[] = [];
    const { registry } = lazy({
      index: { "beta.one": ["beta", "alpha"] },
      load: async (name) => {
        order.push(name);
        return name === "alpha" ? alpha : beta;
      },
    });
    await registry.resolve(["beta", "one"]);
    expect(order).toEqual(["beta", "alpha"]);
  });

  it("loads each package in the order of the packages with loadAll(), and keeps going after a failure", async () => {
    const order: string[] = [];
    const { registry, warnings } = lazy({
      packages: ["beta", "broken", "alpha"],
      load: async (name) => {
        order.push(name);
        if (name === "broken") throw new Error("no build");
        return name === "alpha" ? alpha : beta;
      },
    });
    await registry.loadAll();
    expect(order).toEqual(["beta", "broken", "alpha"]);
    expect(registry.has(["alpha", "one"]) && registry.has(["beta", "one"])).toBe(true);
    expect(warnings).toEqual(["the procedures of broken did not load: no build"]);
  });

  it("registers through registerModules(): a module that two packages require registers one time", async () => {
    const shared = defineModule("shared", [proc(["shared", "one"], () => "shared")]);
    const first = defineModule("first", [proc(["first", "one"], () => 1)], [shared]);
    const second = defineModule("second", [proc(["second", "one"], () => 2)], [shared]);
    const { registry } = lazy({
      index: { "first.one": ["first"], "second.one": ["second"] },
      packages: ["first", "second"],
      load: async (name) => (name === "first" ? first : second),
    });
    await registry.resolve(["first", "one"]);
    await registry.resolve(["second", "one"]);
    expect(registry.has(["shared", "one"])).toBe(true);
  });
});

describe("an eager registry", () => {
  it("is not lazy: resolve() is get(), and loadAll() does nothing", async () => {
    const registry = createRegistry(alpha);
    expect(registry.lazy).toBe(false);
    expect(await registry.resolve(["beta", "one"])).toBeUndefined();
    expect((await registry.resolve(["alpha", "one"]))?.path).toEqual(["alpha", "one"]);
    const before = registry.getAll().length;
    await registry.loadAll();
    expect(registry.getAll().length).toBe(before);
    expect(PROCEDURE_REGISTRY.lazy).toBe(false);
  });

  it("gives no preload for a program", () => {
    expect(preloadRefPaths(createRegistry(alpha), { $proc: ["beta", "one"], input: {} })).toBeUndefined();
  });

  it("works with resolveIn() and loadAllIn() for a registry without resolve()", async () => {
    const plain = { get: (path: readonly string[]) => (path.join(".") === "alpha.one" ? alpha.procedures[0] : undefined) };
    expect((await resolveIn(plain, ["alpha", "one"]))?.path).toEqual(["alpha", "one"]);
    await expect(loadAllIn({})).resolves.toBeUndefined();
  });
});

describe("the dispatch points with a lazy registry", () => {
  it("exec() of a path and of a program, and call()", async () => {
    const { registry, loads } = lazy();
    const client = clientOf(registry);
    expect(await client.exec(["alpha", "one"], {})).toBe("alpha-one");
    expect(await client.exec({ $proc: ["beta", "one"], input: {} })).toBe("beta-one");
    expect(await client.call(pathToMethod(["alpha", "one"]), {})).toBe("alpha-one");
    expect(Object.fromEntries(loads)).toEqual({ alpha: 1, beta: 1 });
  });

  it("a nested call of a code procedure and the operands of control flow", async () => {
    const nested = lazy();
    expect(await clientOf(nested.registry).exec(["alpha", "callBeta"], {})).toBe("beta-one");
    const flow = lazy();
    const result = await clientOf(flow.registry).exec({
      $proc: ["client", "chain"],
      input: { steps: [{ $proc: ["alpha", "one"], input: {} }, { $proc: ["beta", "one"], input: {} }] },
    });
    expect(result).toMatchObject({ final: "beta-one" });
  });

  it("invokePath()", async () => {
    const { registry } = lazy();
    expect(await outputValue(await invokePath(["beta", "one"], {}, { registry }), ["beta", "one"])).toBe("beta-one");
  });

  it("gives the raw input of a lazy procedure that runs its refs: the program preloads its paths", async () => {
    const seen: unknown[] = [];
    const raw = defineModule("raw", [proc(["raw", "keep"], (input: never) => (seen.push(input), "kept"), { tags: [RUNS_REFS_TAG] })]);
    const registry = createLazyRegistry({ index: { "raw.keep": ["raw"] }, load: async () => raw, warn: () => undefined });
    const ref = { $proc: ["alpha", "one"], input: {} };
    expect(await clientOf(registry).exec({ $proc: ["raw", "keep"], input: { body: ref } })).toBe("kept");
    // The ref inside reached the procedure as data: the rule read the loaded procedure
    expect(seen[0]).toMatchObject({ body: ref });
  });

  it("route() and routeStream()", async () => {
    const { registry } = lazy();
    const client = clientOf(registry);
    const response = await client.route({ route: { alpha: { one: { in: {} } } } } as never);
    expect(JSON.stringify(response)).toContain("alpha-one");
    const streamed = client.routeStream({ route: { beta: { one: { in: {} } } } } as never);
    const items: unknown[] = [];
    for await (const item of streamed.results) items.push(item);
    expect(JSON.stringify(items)).toContain("beta-one");
    await expect(streamed.complete).resolves.toBeDefined();
  });

  it("the server finds the procedure after the load, and reports a failed load", async () => {
    const { registry } = lazy();
    const server = new ProcedureServer({ registry });
    server.registerFromRegistry();
    const response = await server.handle({ id: "1", method: pathToMethod(["beta", "one"]), payload: {}, metadata: {} });
    expect(response.payload).toBe("beta-one");
    expect(server.procedureCount).toBe(clientModule.procedures.length + 1);
    await server.loadAll();
    expect(server.procedureCount).toBe(clientModule.procedures.length + 3);
  });

  it("the server loads no package for a request that it refuses, or outside the expose rule of the face (audit 2026-11-08)", async () => {
    const { registry, loads } = lazy({
      load: async (name) => {
        loads.set(name, (loads.get(name) ?? 0) + 1);
        throw new Error(`the build of ${name} is missing`);
      },
    });
    const server = new ProcedureServer({ registry, token: "secret" });
    server.registerFromRegistry();
    const request = (id: string, extra: Record<string, unknown> = {}) => ({ id, method: pathToMethod(["no", "such"]), payload: {}, metadata: {}, ...extra });
    const refused = await server.handle(request("1"));
    expect(refused.status).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
    expect(JSON.stringify(refused)).not.toContain("the build of");
    expect((await server.handle(request("2", { credentials: { bearer: "wrong" } }))).status).toMatchObject({ code: "UNAUTHORIZED" });
    expect((await server.handle(request("3", { credentials: { bearer: "secret" }, expose: () => false }))).status).toMatchObject({ type: "error" });
    expect(loads.size).toBe(0);
    // An admitted request loads the packages, and gets the load error
    const admitted = await server.handle(request("4", { credentials: { bearer: "secret" } }));
    expect(JSON.stringify(admitted)).toContain("the build of");
    expect(loads.size).toBe(2);
  });

  it("runs the authenticate function one time for a call that loads its package", async () => {
    const { registry } = lazy();
    let checks = 0;
    const server = new ProcedureServer({
      registry,
      authenticate: () => {
        checks++;
        return { id: "alice", via: "test" };
      },
    });
    server.registerFromRegistry();
    const response = await server.handle({ id: "1", method: pathToMethod(["beta", "one"]), payload: {}, metadata: {}, credentials: {} });
    expect(response.payload).toBe("beta-one");
    expect(checks).toBe(1);
  });

  it("the local transport reports a failed load with its cause", async () => {
    const { registry } = lazy({
      load: async () => {
        throw new Error("the build is missing");
      },
    });
    const client = new Client({ transport: new LocalTransport({ registry }) });
    const error = await client.call(pathToMethod(["alpha", "one"]), {}).catch((caught: unknown) => caught);
    expect(String((error as Error)?.message ?? JSON.stringify(error))).toContain("the build is missing");
  });

  it("loads each package before a procedure that declares a read of the registry", async () => {
    const { registry, loads } = lazy();
    const counter = defineModule("counter", [
      proc(["counter", "count"], (_input, ctx) => (ctx.registry as ProcedureRegistry).getAll().length, { effects: REGISTRY_READ_EFFECTS }),
    ]);
    const withCounter = createLazyRegistry({ modules: [counter], index: INDEX, packages: ["alpha", "beta"], load: async (name) => (name === "alpha" ? alpha : beta), warn: () => undefined });
    expect(await clientOf(withCounter).exec(["counter", "count"], {})).toBe(clientModule.procedures.length + 4);
    // procedure.list loads each package too
    const listed = (await clientOf(registry).exec(["procedure", "list"], {})) as unknown;
    expect(JSON.stringify(listed)).toContain("beta");
    expect(Object.fromEntries(loads)).toEqual({ alpha: 1, beta: 1 });
  });

  it("warns once for each path through the console by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const registry = createLazyRegistry({ index: {}, packages: [], load: async () => undefined });
      await registry.resolve(["x", "y"]);
      await registry.resolve(["x", "y"]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
