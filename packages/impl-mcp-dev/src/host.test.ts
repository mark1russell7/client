/**
 * The dev-tools host builds its registry from the modules of its bundles (roadmap 3.1). It must
 * serve what the server served from the global registry: the same procedures, the same tools and
 * the same hidden reach (tools.snapshot.txt and reachable.snapshot.txt stay valid).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PROCEDURE_REGISTRY, hiddenReach, pathToKey, type AnyProcedure } from "@procedures/client";
import { exposeRule, mergeSurfaces } from "@procedures/mcp-server";
import { createDevToolsHost, type DevToolsHost } from "./host.js";

const keys = (procedures: readonly AnyProcedure[]): string[] => procedures.map((procedure) => pathToKey(procedure.path)).sort();

let host: DevToolsHost;
let globalProcedures: AnyProcedure[];
let globalExpose: (path: string[]) => boolean;

beforeAll(async () => {
  host = await createDevToolsHost({
    bundles: ["@procedures/bundle-mcp"],
    serverName: "test",
    serverVersion: "0",
    debug: false,
    toolTimeoutMs: 0,
  });
  // The old way: import the bundle, which registers in the global registry
  const bundle = await import("@procedures/bundle-mcp/register.js");
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

describe("the read-only dev-tools host (CAPABILITIES-2026-10)", () => {
  let readOnly: DevToolsHost;

  beforeAll(async () => {
    readOnly = await createDevToolsHost({
      bundles: ["@procedures/bundle-mcp"],
      serverName: "test",
      serverVersion: "0",
      debug: false,
      toolTimeoutMs: 0,
      readOnly: true,
    });
  });

  it("exposes only the procedures that declare that they change nothing", () => {
    const exposed = readOnly.registry.getAll().filter((procedure) => procedure.handler && readOnly.policy.expose!(procedure.path));
    expect(exposed.length).toBeGreaterThan(0);
    for (const procedure of exposed) {
      expect((procedure.metadata as { effects?: { writes?: unknown } }).effects?.writes, pathToKey(procedure.path)).toEqual([]);
    }
    expect(readOnly.policy.expose!(["client", "chain"])).toBe(true);
    expect(readOnly.policy.expose!(["procedure", "define"])).toBe(false);
  });

  it("refuses a procedure that changes something, also in a chain", async () => {
    const define = await readOnly.server.handle({
      id: "1",
      method: { service: "client", operation: "chain" },
      payload: { steps: [{ $proc: ["procedure", "define"], input: { path: ["x", "y"], aggregation: { $proc: ["client", "identity"], input: {} } } }] },
      metadata: {},
    });
    expect(define.status.type).toBe("error");
    expect(readOnly.registry.get(["x", "y"])).toBeUndefined();
  });
});
