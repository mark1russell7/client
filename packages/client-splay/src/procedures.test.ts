/**
 * The procedures of `@procedures/splay` (roadmap R33): the bridge procedures of `splayModule`,
 * and the component procedures of `componentToProcedure()`, rendered by the general package
 * `@mark1russell7/splay` through `createClientRegistry()` and `createStreamingRegistry()`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dispatch, pathDepth, TYPE_SYMBOL, type Registry as SplayRegistry } from "@mark1russell7/splay";
import {
  createRegistry,
  invokePath,
  outputItems,
  outputValue,
  ProcedureRegistry,
  type ProcedurePath,
} from "@procedures/client";
import { registerSplayProcedures, splayModule } from "./module.js";
import { createCheckedRegistry, createClientRegistry, createRenderContext } from "./registry.js";
import { createStreamingRegistry } from "./streaming.js";
import { componentToProcedure } from "./components/define.js";
import type { ComponentDefinition, ComponentOutput } from "./components/types.js";
import type { Registry } from "./types.js";

const SIZE = { width: 320, height: 200 };

/**
 * The client registry as the registry type of splay. The `render` of the `RenderContext` of
 * splay gives `unknown`, and the one of this package gives a `ComponentOutput`, so TypeScript
 * needs this cast. At run time the two agree.
 */
function forSplay(registry: Registry): SplayRegistry<Promise<ComponentOutput>> {
  return registry as unknown as SplayRegistry<Promise<ComponentOutput>>;
}

/** A registry with the bridge procedures and the given components (each at components.ui.<type>). */
function registryWith(...definitions: ComponentDefinition[]): ProcedureRegistry {
  const registry = createRegistry(splayModule);
  for (const definition of definitions) {
    const path = definition.namespace ? ["components", definition.namespace, definition.type] : ["components", definition.type];
    registry.register(componentToProcedure(definition, path));
  }
  return registry;
}

/** The caller of `createClientRegistry()`: one value of a procedure of the registry. */
function callerOf(registry: ProcedureRegistry) {
  return async <T>(path: string[], input: unknown): Promise<T> => outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** The caller of `createStreamingRegistry()`: the items of a procedure of the registry. */
function streamerOf(registry: ProcedureRegistry) {
  return <T>(path: string[], input: unknown): AsyncIterable<T> =>
    (async function* () {
      yield* outputItems(await invokePath<T>(path, input, { registry }));
    })();
}

async function call<T>(registry: ProcedureRegistry, path: ProcedurePath, input?: unknown): Promise<T> {
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

describe("splay.bridge.info and splay.bridge.health", () => {
  it("give the bridge information and its health", async () => {
    const registry = registryWith();
    // The real version of the package, as the read of the file gave it before the JSON import
    // (CLI-52): before R33, the procedure gave "1.0.0" for each version
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { name: string; version: string };
    expect(manifest.name).toBe("@procedures/splay");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    const info = { name: manifest.name, version: manifest.version, description: "Bridge between splay and client" };
    expect(await call(registry, ["splay", "bridge", "info"])).toEqual(info);
    // The second call gives the same answer
    expect(await call(registry, ["splay", "bridge", "info"])).toEqual(info);
    const health = await call<{ status: string; timestamp: string }>(registry, ["splay", "bridge", "health"]);
    expect(health.status).toBe("healthy");
    expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
  });

  it("declare that they change nothing, so a read-only capability permits them", async () => {
    for (const procedure of splayModule.procedures) {
      expect(procedure.metadata.effects).toEqual({ reads: [], writes: [] });
    }
    const registry = registryWith();
    const readOnly = { effects: { writes: [] as string[] } };
    const output = await invokePath(["splay", "bridge", "health"], undefined, { registry, capability: readOnly });
    expect(await outputValue(output)).toMatchObject({ status: "healthy" });
  });

  it("registerSplayProcedures registers them, also a second time", () => {
    const registry = new ProcedureRegistry();
    registerSplayProcedures(registry);
    registerSplayProcedures(registry);
    expect(registry.has(["splay", "bridge", "info"])).toBe(true);
    expect(registry.has(["splay", "bridge", "health"])).toBe(true);
  });
});

describe("component procedures rendered by @mark1russell7/splay", () => {
  const userCard: ComponentDefinition<{ name: string }> = {
    type: "user-card",
    namespace: "ui",
    factory: (ctx) => ({ type: "card", props: { title: ctx.data.name, width: ctx.size.width, path: ctx.path, depth: ctx.depth } }),
  };

  it("dispatch of splay finds the renderer of a type and calls its procedure", async () => {
    const registry = registryWith(userCard as ComponentDefinition);
    const viewers = createClientRegistry(callerOf(registry), { namespace: "ui" });
    const data = { [TYPE_SYMBOL]: "user-card", name: "Ada" };
    const output = await dispatch(data, SIZE, "root.user", { registry: forSplay(viewers) });
    // The depth comes from splay: the number of the segments of the path
    expect(output).toEqual({ type: "card", props: { title: "Ada", width: 320, path: "root.user", depth: pathDepth("root.user") } });
  });

  it("a missing component procedure fails with NOT_FOUND at the call, and has() of a checked registry tells it before", async () => {
    const registry = registryWith(userCard as ComponentDefinition);
    const viewers = createClientRegistry(callerOf(registry), { namespace: "ui" });
    // The registry of splay asks get(): a client registry always gives a renderer
    await expect(dispatch({ [TYPE_SYMBOL]: "missing" }, SIZE, "root", { registry: forSplay(viewers) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const checked = createCheckedRegistry(callerOf(registry), (path) => registry.has(path), { namespace: "ui" });
    expect(checked.has("user-card")).toBe(true);
    expect(checked.has("missing")).toBe(false);
    expect(() => viewers.register("x", () => ({ type: "x", props: {} }))).toThrow("components.ui.x");
  });

  it("validates the input of a component: the size, and the data with its schema", async () => {
    const strict: ComponentDefinition<{ name: string }> = {
      ...userCard,
      type: "strict-card",
      input: {
        parse: (value: unknown) => value as { name: string },
        safeParse: (value: unknown) =>
          typeof (value as { name?: unknown } | null)?.name === "string"
            ? { success: true as const, data: value as { name: string } }
            : { success: false as const, error: { message: "name must be a string", errors: [{ path: ["name"], message: "name must be a string" }] } },
      },
    };
    const registry = registryWith(strict as ComponentDefinition);
    const path = ["components", "ui", "strict-card"];
    await expect(call(registry, path, { data: { name: 7 }, size: SIZE, path: "root" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call(registry, path, { data: { name: "Ada" }, size: { width: "wide" }, path: "root" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await call<ComponentOutput>(registry, path, { data: { name: "Ada" }, size: SIZE, path: "root" })).toMatchObject({ type: "card" });
  });

  it("refuses an output that is not a component descriptor", async () => {
    const broken: ComponentDefinition = { type: "broken", factory: () => ({ props: {} }) as unknown as ComponentOutput };
    const registry = registryWith(broken);
    await expect(call(registry, ["components", "broken"], { data: {}, size: SIZE, path: "root" })).rejects.toMatchObject({
      code: "OUTPUT_VALIDATION_ERROR",
    });
  });

  it("a component renders its children from the registry of its host, at each depth", async () => {
    const page: ComponentDefinition = {
      type: "page",
      namespace: "ui",
      factory: async (ctx) => ({ type: "page", props: {}, children: [await ctx.render({ type: "section" }, ctx.size, "root.section")] }),
    };
    const section: ComponentDefinition = {
      type: "section",
      namespace: "ui",
      factory: async (ctx) => ({ type: "section", props: {}, children: [await ctx.render({ type: "badge" }, ctx.size, "root.section.badge")] }),
    };
    const badge: ComponentDefinition = { type: "badge", namespace: "ui", factory: () => ({ type: "badge", props: { label: "new" } }) };
    // The components are only in this registry, not in the global one
    const registry = registryWith(page, section, badge);
    const output = await call<ComponentOutput>(registry, ["components", "ui", "page"], { data: {}, size: SIZE, path: "root" });
    expect(output).toEqual({
      type: "page",
      props: {},
      children: [{ type: "section", props: {}, children: [{ type: "badge", props: { label: "new" } }] }],
    });
  });

  it("createRenderContext renders a child through the registry of splay", async () => {
    const registry = registryWith(userCard as ComponentDefinition);
    const viewers = createClientRegistry(callerOf(registry), { namespace: "ui" });
    const ctx = createRenderContext(viewers, {}, SIZE);
    expect(await ctx.render({ type: "user-card", name: "Grace" }, SIZE, "root.child")).toMatchObject({ props: { title: "Grace", depth: 1 } });
    await expect(ctx.render({ name: "no type" }, SIZE, "root.child")).rejects.toThrow("Cannot determine component type");
  });
});

describe("streaming component procedures", () => {
  const ticker: ComponentDefinition<{ count: number }> = {
    type: "ticker",
    namespace: "live",
    streaming: true,
    factory: async function* (ctx) {
      for (let tick = 1; tick <= ctx.data.count; tick++) yield { type: "tick", props: { tick } };
    },
  };

  it("give each output to a streaming registry without a buffer", async () => {
    const registry = registryWith(ticker as ComponentDefinition);
    const streaming = createStreamingRegistry(streamerOf(registry), { namespace: "live", bufferSize: 1 });
    const renderer = streaming.get("ticker")!;
    const ticks: unknown[] = [];
    for await (const output of renderer({ data: { count: 3 }, size: SIZE, path: "root", depth: 0, render: () => ({ type: "x", props: {} }) })) {
      ticks.push(output.props["tick"]);
    }
    expect(ticks).toEqual([1, 2, 3]);
  });

  it("give the last output of each full buffer, and the rest at the end", async () => {
    const registry = registryWith(ticker as ComponentDefinition);
    const streaming = createStreamingRegistry(streamerOf(registry), { namespace: "live", bufferSize: 2 });
    const ticks: unknown[] = [];
    for await (const output of streaming.get("ticker")!({ data: { count: 5 }, size: SIZE, path: "root", depth: 0, render: () => ({ type: "x", props: {} }) })) {
      ticks.push(output.props["tick"]);
    }
    expect(ticks).toEqual([2, 4, 5]);
  });

  it("the procedure of a streaming component is a stream", async () => {
    const registry = registryWith(ticker as ComponentDefinition);
    const output = await invokePath(["components", "live", "ticker"], { data: { count: 2 }, size: SIZE, path: "root" }, { registry });
    expect(output.kind).toBe("stream");
  });
});
