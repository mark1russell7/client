/**
 * The expose rule of ProcedureServer (regression: BUGS-2026-07 H18).
 *
 * The MCP server hid nothing: every registered procedure was a tool, and `client.chain` could
 * call any registered procedure by path. With `expose`, the server registers only the exposed
 * procedures, and a data-driven procedure can call only exposed procedures. A procedure of code
 * still calls its dependencies (as `docker.run` calls `shell.exec`).
 */

import { describe, it, expect } from "vitest";
import { ProcedureServer } from "./procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { coreProcedures } from "../procedures/core/index.js";
import { RUNS_REFS_TAG } from "../procedures/ref.js";
import { defineProcedureProcedure } from "../procedures/define-procedure.js";
import type { ProcedureContext } from "../procedures/types.js";
import type { ServerResponse } from "./types.js";

function makeServer(): { server: ProcedureServer; shellCalls: string[] } {
  const shellCalls: string[] = [];
  const registry = new ProcedureRegistry();
  for (const procedure of coreProcedures) registry.register(procedure);
  // A hidden procedure, like shell.exec
  registry.register(
    defineProcedure({
      path: ["shell", "exec"],
      input: outputSchema<{ command: string }>(),
      output: outputSchema<string>(),
      handler: (input: { command: string }) => {
        shellCalls.push(input.command);
        return `ran ${input.command}`;
      },
    }),
  );
  // An exposed procedure of code that uses the hidden one, like docker.ps
  registry.register(
    defineProcedure({
      path: ["docker", "ps"],
      input: outputSchema<Record<string, never>>(),
      output: outputSchema<string>(),
      handler: (_input: unknown, ctx: ProcedureContext) => ctx.client.call<{ command: string }, string>(["shell", "exec"], { command: "docker ps" }),
    }),
  );
  // An exposed procedure of code that runs refs from its input, like dag.traverse
  registry.register(
    defineProcedure({
      path: ["docker", "each"],
      input: outputSchema<{ visit: { $proc: string[]; input: unknown } }>(),
      output: outputSchema<unknown>(),
      metadata: { tags: [RUNS_REFS_TAG] },
      handler: (input: { visit: { $proc: string[]; input: unknown } }, ctx: ProcedureContext) =>
        ctx.client.call(input.visit.$proc, input.visit.input),
    }),
  );
  const expose = (path: string[]): boolean => path[0] === "client" || path[0] === "docker";
  return { server: new ProcedureServer({ registry, autoRegister: true, expose }), shellCalls };
}

async function call(server: ProcedureServer, service: string, operation: string, payload: unknown): Promise<ServerResponse> {
  return server.handle({ id: "1", method: { service, operation }, payload, metadata: {} });
}

describe("ProcedureServer expose", () => {
  it("registers only the exposed procedures", async () => {
    const { server, shellCalls } = makeServer();
    expect(server.hasProcedure(["shell", "exec"])).toBe(false);
    expect(server.hasProcedure(["docker", "ps"])).toBe(true);
    const response = await call(server, "shell", "exec", { command: "rm -rf /" });
    expect(response.status.type).toBe("error");
    expect(shellCalls).toEqual([]);
  });

  it("lets a procedure of code call a hidden dependency", async () => {
    const { server, shellCalls } = makeServer();
    const response = await call(server, "docker", "ps", {});
    expect(response.payload).toBe("ran docker ps");
    expect(shellCalls).toEqual(["docker ps"]);
  });

  it("does not let client.chain call a hidden procedure", async () => {
    const { server, shellCalls } = makeServer();
    const response = await call(server, "client", "chain", {
      steps: [{ $proc: ["shell", "exec"], input: { command: "rm -rf /" } }],
    });
    expect(response.status.type).toBe("error");
    expect(response.status.type === "error" && response.status.message).toContain("Procedure not exposed: shell.exec");
    expect(shellCalls).toEqual([]);
  });

  it("lets client.chain call an exposed procedure, which then uses its hidden dependency", async () => {
    const { server, shellCalls } = makeServer();
    const response = await call(server, "client", "chain", { steps: [{ $proc: ["docker", "ps"], input: {} }] });
    expect(response.status.type).toBe("success");
    expect(shellCalls).toEqual(["docker ps"]);
  });

  it("does not let a procedure with the runs-refs tag call a hidden procedure", async () => {
    const { server, shellCalls } = makeServer();
    const response = await call(server, "docker", "each", { visit: { $proc: ["shell", "exec"], input: { command: "x" } } });
    expect(response.status.type).toBe("error");
    expect(shellCalls).toEqual([]);
  });

  it("does not let a nested ref in a chain step reach a hidden procedure", async () => {
    const { server, shellCalls } = makeServer();
    const response = await call(server, "client", "chain", {
      steps: [{ $proc: ["client", "identity"], input: { value: { $proc: ["shell", "exec"], input: { command: "x" } } } }],
    });
    expect(response.status.type).toBe("error");
    expect(shellCalls).toEqual([]);
  });

  it("does not let a procedure that procedure.define made call a hidden procedure", async () => {
    const { server, shellCalls } = makeServer();
    const registry = (server as unknown as { procedureRegistry: ProcedureRegistry }).procedureRegistry;
    // procedure.define registers in the global registry, so run its handler with this registry's view
    const defined = await defineProcedureProcedure.handler!(
      { path: ["docker", "evil"], aggregation: { $proc: ["shell", "exec"], input: { command: "x" } } },
      { metadata: {}, path: ["procedure", "define"], client: { call: async () => undefined as never } },
    );
    expect(defined.path).toEqual(["docker", "evil"]);
    const { PROCEDURE_REGISTRY } = await import("../procedures/registry.js");
    const evil = PROCEDURE_REGISTRY.get(["docker", "evil"])!;
    registry.register(evil);
    server.registerProcedure(evil);
    const response = await call(server, "docker", "evil", {});
    expect(response.status.type).toBe("error");
    expect(shellCalls).toEqual([]);
    PROCEDURE_REGISTRY.unregister(["docker", "evil"]);
  });

  it("exposes everything without the rule (the old behavior)", async () => {
    const registry = new ProcedureRegistry();
    for (const procedure of coreProcedures) registry.register(procedure);
    registry.register(
      defineProcedure({
        path: ["shell", "exec"],
        input: outputSchema<{ command: string }>(),
        output: outputSchema<string>(),
        handler: () => "ran",
      }),
    );
    const server = new ProcedureServer({ registry, autoRegister: true });
    const response = await call(server, "client", "chain", { steps: [{ $proc: ["shell", "exec"], input: { command: "x" } }] });
    expect(response.status.type).toBe("success");
  });
});
