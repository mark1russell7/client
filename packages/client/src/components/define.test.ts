import { describe, it, expect } from "vitest";
import { defineComponent, componentToProcedure } from "./define.js";
import { isStreamingFactory } from "./types.js";
import { PROCEDURE_REGISTRY } from "../procedures/registry.js";
import type { ProcedureContext } from "../procedures/types.js";
import type { ComponentOutput } from "./types.js";

// defineComponent registers into the global registry: use names no other test uses
async function renderVia(namespace: string, type: string, data: unknown): Promise<ComponentOutput> {
  const path = ["components", namespace, type];
  const procedure = PROCEDURE_REGISTRY.get(path);
  if (!procedure?.handler) throw new Error(`no component at ${path.join(".")}`);
  const ctx = { metadata: {}, path, client: { call: async () => undefined } } as unknown as ProcedureContext;
  return (await procedure.handler({ data, size: { width: 100, height: 50 }, path: "root" }, ctx)) as ComponentOutput;
}

describe("component rendering (regression: BUGS-2026-07 L3)", () => {
  it("renders a child from the namespace of the parent before the global one", async () => {
    defineComponent({ type: "l3-child", factory: () => ({ type: "global-child", props: {} }) });
    defineComponent({ type: "l3-child", namespace: "l3ns", factory: () => ({ type: "namespaced-child", props: {} }) });
    defineComponent({
      type: "l3-parent",
      namespace: "l3ns",
      factory: async (ctx) => ctx.render({ type: "l3-child" }, ctx.size, "child"),
    });

    const output = await renderVia("l3ns", "l3-parent", {});

    expect(output.type).toBe("namespaced-child");
  });

  it("falls back to the global component when the namespace has none", async () => {
    defineComponent({ type: "l3-only-global", factory: () => ({ type: "global-only", props: {} }) });
    defineComponent({
      type: "l3-parent2",
      namespace: "l3ns2",
      factory: async (ctx) => ctx.render({ type: "l3-only-global" }, ctx.size, "child"),
    });

    const output = await renderVia("l3ns2", "l3-parent2", {});

    expect(output.type).toBe("global-only");
  });

  it("ends a streaming child after taking its first output", async () => {
    let finished = false;
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
    });
    defineComponent({
      type: "l3-parent3",
      namespace: "l3ns3",
      factory: async (ctx) => ctx.render({ type: "l3-stream" }, ctx.size, "child"),
    });

    const output = await renderVia("l3ns3", "l3-parent3", {});

    expect(output.type).toBe("first");
    expect(finished).toBe(true);
  });
});

describe("component rendering through the invocation path (deep dive core.md, low items)", () => {
  it("validates the input of a child component", async () => {
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
      factory: (ctx) => ({ type: "child", props: { n: (ctx.data as { n: number }).n } }),
    });
    defineComponent({
      type: "lo-parent",
      namespace: "lo1",
      factory: async (ctx) => ctx.render({ type: "lo-strict-child", n: "not a number" }, ctx.size, "child"),
    });

    await expect(renderVia("lo1", "lo-parent", {})).rejects.toThrow(/n must be a number/);
  });

  it("gives the child its own path in ctx.path", async () => {
    // A component context has no procedure path: a wrapper of the child's handler records it
    const procedure = componentToProcedure(
      { type: "lo-path-probe", factory: () => ({ type: "probe", props: {} }) },
      ["components", "lo2", "lo-path-probe"]
    );
    const seen: string[][] = [];
    const wrapped = { ...procedure, handler: async (input: unknown, ctx: ProcedureContext) => { seen.push([...ctx.path]); return procedure.handler!(input as never, ctx); } };
    PROCEDURE_REGISTRY.register(wrapped, { override: true });
    defineComponent({
      type: "lo-path-parent",
      namespace: "lo2",
      factory: async (ctx) => ctx.render({ type: "lo-path-probe" }, ctx.size, "child"),
    });

    await renderVia("lo2", "lo-path-parent", {});
    expect(seen).toEqual([["components", "lo2", "lo-path-probe"]]);
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
