/**
 * The dev-tools host builds its registry from the modules of its bundles (roadmap 3.1). It must
 * serve what the server served from the global registry: the same procedures, the same tools and
 * the same hidden reach (tools.snapshot.txt and reachable.snapshot.txt stay valid).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PROCEDURE_REGISTRY, hiddenReach, pathToKey, type AnyProcedure } from "@mark1russell7/client";
import { exposeRule, mergeSurfaces } from "@mark1russell7/client-mcp";
import { createDevToolsHost, type DevToolsHost } from "./host.js";

const keys = (procedures: readonly AnyProcedure[]): string[] => procedures.map((procedure) => pathToKey(procedure.path)).sort();

let host: DevToolsHost;
let globalProcedures: AnyProcedure[];
let globalExpose: (path: string[]) => boolean;

beforeAll(async () => {
  host = await createDevToolsHost({
    bundles: ["@mark1russell7/bundle-mcp"],
    serverName: "test",
    serverVersion: "0",
    debug: false,
    toolTimeoutMs: 0,
  });
  // The old way: import the bundle, which registers in the global registry
  const bundle = await import("@mark1russell7/bundle-mcp/register.js");
  globalProcedures = PROCEDURE_REGISTRY.getAll();
  globalExpose = exposeRule(mergeSurfaces([bundle])!);
});

describe("the dev-tools host", () => {
  it("has its own registry, with the procedures that the global registry gets from the bundle", () => {
    expect(host.registry).not.toBe(PROCEDURE_REGISTRY);
    // Importing client-mcp (the MCP transport) registers mcp.* in the global registry. The old
    // server had them too, but never as tools and never reachable; the host registry leaves them out.
    const fromBundle = keys(globalProcedures).filter((key) => !key.startsWith("mcp."));
    expect(keys(host.registry.getAll())).toEqual(fromBundle);
  });

  it("exposes the same tools", () => {
    const tools = (procedures: AnyProcedure[], expose: (path: string[]) => boolean) =>
      keys(procedures.filter((procedure) => procedure.handler && expose(procedure.path)));
    expect(tools(host.registry.getAll(), host.policy.expose!)).toEqual(tools(globalProcedures, globalExpose));
  });

  it("reaches the same hidden procedures", () => {
    const reach = (procedures: AnyProcedure[], expose: (path: string[]) => boolean) =>
      hiddenReach(procedures, expose).map((call) => `${call.from} -> ${call.to}`).sort();
    expect(reach(host.registry.getAll(), host.policy.expose!)).toEqual(reach(globalProcedures, globalExpose));
  });

  it("has the policy of an MCP host: strict calls and the surface of the bundle", () => {
    expect(host.policy.strictCalls).toBe(true);
    expect(host.surface?.namespaces).toContain("docker");
    expect(host.policy.expose!(["shell", "exec"])).toBe(false);
  });
});
