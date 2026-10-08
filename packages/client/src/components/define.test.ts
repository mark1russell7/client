import { describe, it, expect } from "vitest";
import { defineComponent } from "./define.js";
import { PROCEDURE_REGISTRY } from "../procedures/registry.js";
import type { ProcedureContext } from "../procedures/types.js";
import type { ComponentOutput } from "./types.js";

// defineComponent registers into the global registry: use names no other test uses
async function renderVia(namespace: string, type: string, data: unknown): Promise<ComponentOutput> {
  const path = ["components", namespace, type];
  const procedure = PROCEDURE_REGISTRY.get(path);
  if (!procedure?.handler) throw new Error(`no component at ${path.join(".")}`);
  const ctx = { metadata: {}, path, client: { call: async () => undefined } } as unknown as ProcedureContext;
  return (await procedure.handler({ data, size: "md", path: "root" }, ctx)) as ComponentOutput;
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
