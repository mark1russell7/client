import { describe, it, expect } from "vitest";
import {
  defineComponent,
  simpleComponent,
  namespacedComponent,
  streamingComponent,
  componentModule,
  componentToProcedure,
  createBundle,
} from "./define.js";
import * as components from "./index.js";
import { isStreamingFactory } from "./types.js";
import { PROCEDURE_REGISTRY, createRegistry, invokePath, outputValue, registerModules } from "@procedures/client";
import type { ProcedureContext, ProcedureRegistry } from "@procedures/client";
import type { AnyComponentDefinition, ComponentOutput } from "./types.js";

/** A registry with the procedures of the components, from `componentModule()` (O75: no global registration). */
function registryOf(...definitions: AnyComponentDefinition[]): ProcedureRegistry {
  return createRegistry(componentModule("define-test", definitions));
}

/** Render a component of a registry through the invocation path, as a host does. */
async function renderVia(registry: ProcedureRegistry, namespace: string, type: string, data: unknown): Promise<ComponentOutput> {
  const path = ["components", namespace, type];
  return outputValue(await invokePath<ComponentOutput>(path, { data, size: { width: 100, height: 50 }, path: "root" }, { registry }), path);
}

describe("the definition helpers register nothing (O75)", () => {
  it("defineComponent, simpleComponent, namespacedComponent and streamingComponent only give the definition", () => {
    const factory = () => ({ type: "x", props: {} });
    const defined = defineComponent({ type: "o75-define", namespace: "o75", factory });
    const simple = simpleComponent("o75-simple", factory);
    const namespaced = namespacedComponent("o75", "o75-namespaced", factory);
    const streaming = streamingComponent("o75-streaming", async function* () {
      yield { type: "x", props: {} };
    });

    expect(defined).toEqual({ type: "o75-define", namespace: "o75", factory });
    expect(simple).toEqual({ type: "o75-simple", factory });
    expect(namespaced).toEqual({ type: "o75-namespaced", namespace: "o75", factory });
    expect(streaming).toMatchObject({ type: "o75-streaming", streaming: true });
    expect(PROCEDURE_REGISTRY.has(["components", "o75", "o75-define"])).toBe(false);
    expect(PROCEDURE_REGISTRY.has(["components", "o75-simple"])).toBe(false);
    expect(PROCEDURE_REGISTRY.has(["components", "o75", "o75-namespaced"])).toBe(false);
    expect(PROCEDURE_REGISTRY.has(["components", "o75-streaming"])).toBe(false);
  });

  it("the package has no registerBundle export", () => {
    expect("registerBundle" in components).toBe(false);
  });

  it("componentModule with registerModules puts the components in the global registry", async () => {
    const module = componentModule(
      "o75-global",
      createBundle("o75g", [
        simpleComponent("o75-card", () => ({ type: "card", props: {} })),
        namespacedComponent("o75own", "o75-badge", () => ({ type: "badge", props: {} })),
      ])
    );
    try {
      registerModules(PROCEDURE_REGISTRY, [module]);

      expect(PROCEDURE_REGISTRY.has(["components", "o75g", "o75-card"])).toBe(true);
      expect(PROCEDURE_REGISTRY.has(["components", "o75own", "o75-badge"])).toBe(true);
      // The default registry of invokePath is the global one
      const path = ["components", "o75g", "o75-card"];
      const output = await outputValue(await invokePath<ComponentOutput>(path, { data: {}, size: { width: 1, height: 1 }, path: "root" }), path);
      expect(output.type).toBe("card");
    } finally {
      PROCEDURE_REGISTRY.unregister(["components", "o75g", "o75-card"]);
      PROCEDURE_REGISTRY.unregister(["components", "o75own", "o75-badge"]);
    }
  });
});

describe("component rendering (regression: BUGS-2026-07 L3)", () => {
  it("renders a child from the namespace of the parent before the global one", async () => {
    const registry = registryOf(
      defineComponent({ type: "l3-child", factory: () => ({ type: "global-child", props: {} }) }),
      defineComponent({ type: "l3-child", namespace: "l3ns", factory: () => ({ type: "namespaced-child", props: {} }) }),
      defineComponent({
        type: "l3-parent",
        namespace: "l3ns",
        factory: async (ctx) => ctx.render({ type: "l3-child" }, ctx.size, "child"),
      })
    );

    const output = await renderVia(registry, "l3ns", "l3-parent", {});

    expect(output.type).toBe("namespaced-child");
  });

  it("falls back to the global component when the namespace has none", async () => {
    const registry = registryOf(
      defineComponent({ type: "l3-only-global", factory: () => ({ type: "global-only", props: {} }) }),
      defineComponent({
        type: "l3-parent2",
        namespace: "l3ns2",
        factory: async (ctx) => ctx.render({ type: "l3-only-global" }, ctx.size, "child"),
      })
    );

    const output = await renderVia(registry, "l3ns2", "l3-parent2", {});

    expect(output.type).toBe("global-only");
  });

  it("ends a streaming child after taking its first output", async () => {
    let finished = false;
    const registry = registryOf(
      defineComponent({
        type: "l3-stream",
        namespace: "l3ns3",
        streaming: true,
        factory: async function* () {
          try {
            yield { type: "first", props: {} };
            yield { type: "second", props: {} };
          } finally {
            finished = true;
          }
        },
      }),
      defineComponent({
        type: "l3-parent3",
        namespace: "l3ns3",
        factory: async (ctx) => ctx.render({ type: "l3-stream" }, ctx.size, "child"),
      })
    );

    const output = await renderVia(registry, "l3ns3", "l3-parent3", {});

    expect(output.type).toBe("first");
    expect(finished).toBe(true);
  });
});

describe("component rendering through the invocation path (deep dive core.md, low items)", () => {
  it("validates the input of a child component", async () => {
    // A definition with a typed input schema goes into the list as it is
    const registry = registryOf(
      defineComponent({
        type: "lo-strict-child",
        namespace: "lo1",
        input: {
          parse: (v: unknown) => v as { n: number },
          safeParse: (v: unknown) =>
            typeof (v as { n?: unknown })?.n === "number"
              ? { success: true as const, data: v as { n: number } }
              : { success: false as const, error: { message: "n must be a number", errors: [] } },
        },
        factory: (ctx) => ({ type: "child", props: { n: ctx.data.n } }),
      }),
      defineComponent({
        type: "lo-parent",
        namespace: "lo1",
        factory: async (ctx) => ctx.render({ type: "lo-strict-child", n: "not a number" }, ctx.size, "child"),
      })
    );

    await expect(renderVia(registry, "lo1", "lo-parent", {})).rejects.toThrow(/n must be a number/);
  });

  it("gives the child its own path in ctx.path", async () => {
    // A component context has no procedure path: a wrapper of the child's handler records it
    const procedure = componentToProcedure(
      { type: "lo-path-probe", factory: () => ({ type: "probe", props: {} }) },
      ["components", "lo2", "lo-path-probe"]
    );
    const seen: string[][] = [];
    const wrapped = { ...procedure, handler: async (input: unknown, ctx: ProcedureContext) => { seen.push([...ctx.path]); return procedure.handler!(input as never, ctx); } };
    const registry = registryOf(
      defineComponent({
        type: "lo-path-parent",
        namespace: "lo2",
        factory: async (ctx) => ctx.render({ type: "lo-path-probe" }, ctx.size, "child"),
      })
    );
    registry.register(wrapped);

    await renderVia(registry, "lo2", "lo-path-parent", {});
    expect(seen).toEqual([["components", "lo2", "lo-path-probe"]]);
  });
});

describe("componentModule (rule I2: a module, not the global registry)", () => {
  it("gives the procedures of a bundle as a module, and registers nothing in the global registry", async () => {
    const module = componentModule(
      "cm-ui",
      createBundle("cmns", [
        { type: "cm-card", factory: () => ({ type: "card", props: {} }) },
        { type: "cm-badge", namespace: "cmown", factory: () => ({ type: "badge", props: {} }) },
      ])
    );

    expect(module.name).toBe("cm-ui");
    expect(module.procedures.map((procedure) => procedure.path)).toEqual([
      ["components", "cmns", "cm-card"],
      ["components", "cmown", "cm-badge"],
    ]);
    expect(PROCEDURE_REGISTRY.has(["components", "cmns", "cm-card"])).toBe(false);
    const registry = createRegistry(module);
    expect(registry.has(["components", "cmns", "cm-card"])).toBe(true);
    expect(registry.has(["components", "cmown", "cm-badge"])).toBe(true);
  });

  it("takes a list of definitions without a bundle", () => {
    const module = componentModule("cm-list", [{ type: "cm-plain", factory: () => ({ type: "plain", props: {} }) }]);
    expect(module.procedures.map((procedure) => procedure.path)).toEqual([["components", "cm-plain"]]);
    expect(PROCEDURE_REGISTRY.has(["components", "cm-plain"])).toBe(false);
  });
});

describe("isStreamingFactory", () => {
  it("does not depend on constructor.name", () => {
    const factory = async function* () {
      yield { type: "x", props: {} };
    };
    Object.defineProperty(factory, "constructor", { value: Function });
    expect(isStreamingFactory(factory)).toBe(true);
    expect(isStreamingFactory(() => ({ type: "x", props: {} }))).toBe(false);
    expect(isStreamingFactory(async () => ({ type: "x", props: {} }))).toBe(false);
  });

  it("a plain function that returns a generator still streams", async () => {
    const generator = async function* () {
      yield { type: "first", props: {} };
      yield { type: "second", props: {} };
    };
    const procedure = componentToProcedure(
      { type: "lo-wrapped-gen", factory: (() => generator()) as never },
      ["components", "lo-wrapped-gen"]
    );
    const ctx = { metadata: {}, path: procedure.path, client: { call: async () => undefined } } as unknown as ProcedureContext;
    const result = await procedure.handler!({ data: {}, size: { width: 1, height: 1 }, path: "root" }, ctx);
    const items: string[] = [];
    for await (const item of result as AsyncIterable<ComponentOutput>) items.push(item.type);
    expect(items).toEqual(["first", "second"]);
  });
});
