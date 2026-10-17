/**
 * The dev-tools host builds its registry from the modules of its bundles (roadmap 3.1). It must
 * serve what the server served from the global registry: the same procedures, the same tools and
 * the same hidden reach (tools.snapshot.txt and reachable.snapshot.txt stay valid).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROCEDURE_REGISTRY, hiddenReach, invokePath, outputValue, pathToKey, pathToMethod, type AnyProcedure } from "@procedures/client";
import { exposeRule, mergeSurfaces, procedureToMcpTool } from "@procedures/mcp-server";
import type { McpServerConfig } from "./config.js";
import { createDevToolsHost, type DevToolsHost } from "./host.js";

const keys = (procedures: readonly AnyProcedure[]): string[] => procedures.map((procedure) => pathToKey(procedure.path)).sort();

const config: McpServerConfig = {
  bundles: ["@procedures/bundle-mcp"],
  serverName: "test",
  serverVersion: "0",
  debug: false,
  toolTimeoutMs: 0,
};

let host: DevToolsHost;
let globalProcedures: AnyProcedure[];
let globalExpose: (path: string[]) => boolean;

beforeAll(async () => {
  host = await createDevToolsHost(config);
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

  it("gives the tool of a defined procedure a description with the effects of its body (roadmap R23)", async () => {
    const response = await host.server.handle({
      id: "r23",
      method: { service: "procedure", operation: "define" },
      payload: { path: ["r23", "names"], aggregation: { $proc: ["procedure", "list"], input: {} }, metadata: { description: "List the procedures" } },
      metadata: {},
    });
    expect(response.status).toMatchObject({ type: "success" });
    const defined = host.registry.get(["r23", "names"]);
    expect(defined).toBeDefined();
    const tool = procedureToMcpTool(defined!);
    expect(tool.description).toBe("List the procedures. It reads registry and changes nothing.");
    expect(tool.annotations).toMatchObject({ readOnlyHint: true });
    host.registry.unregister(["r23", "names"]);
  });
});

describe("the dev-tools host with MCP_FS_ROOT (roadmap R33)", () => {
  let rooted: DevToolsHost;
  let base: string;
  let root: string;
  let outside: string;

  /** A small pnpm workspace with one package, for lib.scan. */
  function workspace(folder: string, name: string): void {
    mkdirSync(join(folder, "packages", name), { recursive: true });
    writeFileSync(join(folder, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeFileSync(join(folder, "packages", name, "package.json"), JSON.stringify({ name }));
  }

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "mcp-fs-root-"));
    root = join(base, "root");
    outside = join(base, "outside");
    workspace(root, "inside-package");
    workspace(outside, "outside-package");
    rooted = await createDevToolsHost({ ...config, fsRoot: root });
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  /** The output of a tool call on the server of a host. */
  async function tool<T>(on: DevToolsHost, path: string[], payload: unknown): Promise<{ type: string; code?: string; value: T }> {
    const response = await on.server.handle({ id: "fs-root", method: pathToMethod(path), payload, metadata: {} });
    const status = response.status as { type: string; code?: string };
    return { type: status.type, ...(status.code ? { code: status.code } : {}), value: (response as { payload?: unknown }).payload as T };
  }

  it("keeps the procedures, the tools and the hidden reach of the host without a root", () => {
    expect(rooted.fsRoot).toBe(root);
    expect(host.fsRoot).toBeUndefined();
    expect(keys(rooted.registry.getAll())).toEqual(keys(host.registry.getAll()));
    const tools = (on: DevToolsHost) => keys(on.registry.getAll().filter((procedure) => procedure.handler && on.policy.expose!(procedure.path)));
    expect(tools(rooted)).toEqual(tools(host));
    expect(rooted.policy.expose!(["fs", "read"])).toBe(false);
  });

  it("accepts a path in the root, and refuses a path outside it with FORBIDDEN (outside-root)", async () => {
    const inside = await invokePath<{ data: unknown }>(["fs", "read.json"], { path: join(root, "packages", "inside-package", "package.json") }, { registry: rooted.registry });
    expect((await outputValue(inside, ["fs", "read.json"])).data).toEqual({ name: "inside-package" });
    await expect(
      invokePath(["fs", "read.json"], { path: join(outside, "packages", "outside-package", "package.json") }, { registry: rooted.registry }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    // Without the root, the same path is accepted
    const free = await invokePath(["fs", "read.json"], { path: join(outside, "packages", "outside-package", "package.json") }, { registry: host.registry });
    expect(await outputValue(free, ["fs", "read.json"])).toMatchObject({ data: { name: "outside-package" } });
  });

  it("confines the paths of a tool: lib.scan reads only the workspaces in the root", async () => {
    const inside = await tool<{ packages: Record<string, unknown> }>(rooted, ["lib", "scan"], { rootPath: root });
    expect(inside.type).toBe("success");
    expect(Object.keys(inside.value.packages)).toEqual(["inside-package"]);

    // The root examines rootPath (metadata.fsRoot) before lib.scan starts
    const refused = await tool(rooted, ["lib", "scan"], { rootPath: outside });
    expect(refused.type).toBe("error");
    expect(refused.code).toBe("FORBIDDEN");
    // The host without a root reads the same workspace
    const free = await tool<{ packages: Record<string, unknown> }>(host, ["lib", "scan"], { rootPath: outside });
    expect(Object.keys(free.value.packages)).toEqual(["outside-package"]);
  });

  it("refuses the tools that the root cannot confine, and keeps them without a root", async () => {
    expect(rooted.refusedUnderRoot).toEqual(expect.arrayContaining(["docker.run", "docker.compose.up", "lib.new", "vitest.run"]));
    expect(host.refusedUnderRoot).toBeUndefined();
    // A refused tool gives FORBIDDEN before it starts docker
    const run = await tool(rooted, ["docker", "run"], { image: "alpine", volumes: [`${outside}:/host`] });
    expect(run).toMatchObject({ type: "error", code: "FORBIDDEN" });
    // A confined tool with a path in the root works: sqlite in a database of the root
    const tables = await tool<{ tables: unknown[] }>(rooted, ["sqlite", "tables"], { dbPath: ":memory:" });
    expect(tables.type).toBe("success");
    const outsideDb = await tool(rooted, ["sqlite", "tables"], { dbPath: join(outside, "x.db") });
    expect(outsideDb).toMatchObject({ type: "error", code: "FORBIDDEN" });
  });

  it("does not start with a root that does not exist", async () => {
    await expect(createDevToolsHost({ ...config, fsRoot: join(base, "missing") })).rejects.toThrow("does not exist");
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

  it("refuses the whole program before its first step, with the check before the run (roadmap R22)", async () => {
    const payload = {
      steps: [
        { $proc: ["procedure", "manifest"], input: { namespace: "client" } },
        { $proc: ["procedure", "define"], input: { path: ["x", "z"], aggregation: { $proc: ["client", "identity"], input: {} } } },
      ],
    };
    const checked = await readOnly.server.handle({ id: "2", method: { service: "client", operation: "chain" }, payload, metadata: {} });
    expect(checked.status).toMatchObject({ type: "error" });
    expect(JSON.stringify(checked.status)).toContain("no step started");

    // Without the check, the interpreter runs step 1, then refuses step 2
    const unchecked = await createDevToolsHost({
      bundles: ["@procedures/bundle-mcp"],
      serverName: "test",
      serverVersion: "0",
      debug: false,
      toolTimeoutMs: 0,
      readOnly: true,
      programCheck: false,
    });
    const late = await unchecked.server.handle({ id: "3", method: { service: "client", operation: "chain" }, payload, metadata: {} });
    expect(late.status).toMatchObject({ type: "error" });
    expect(JSON.stringify(late.status)).not.toContain("no step started");
    expect(unchecked.registry.get(["x", "z"])).toBeUndefined();
  });
});
