import { describe, it, expect } from "vitest";
import { ProcedureRegistry, defineProcedure, outputSchema, type AnyProcedure } from "@procedures/client";
import { serverCreateProcedure, getPeer } from "./server.create.js";

const ping = defineProcedure({
  path: ["test", "ping"],
  input: outputSchema<unknown>(),
  output: outputSchema<unknown>(),
  metadata: { description: "ping", effects: { reads: [], writes: [] } },
  handler: () => "pong",
}) as AnyProcedure;

describe("server.create", () => {
  it("counts the procedures when autoRegister has its default (audit pass 2)", async () => {
    const registry = new ProcedureRegistry();
    registry.register(ping);
    const out = await serverCreateProcedure.handler!({ transports: [{ type: "local" }] }, { registry } as never) as { procedureCount: number; serverId: string };
    try {
      expect(out.procedureCount).toBe(1);
    } finally {
      await getPeer(out.serverId)?.stop();
    }
  });

  it("gives 0 when autoRegister is false", async () => {
    const registry = new ProcedureRegistry();
    registry.register(ping);
    const out = await serverCreateProcedure.handler!({ transports: [{ type: "local" }], autoRegister: false }, { registry } as never) as { procedureCount: number; serverId: string };
    try {
      expect(out.procedureCount).toBe(0);
    } finally {
      await getPeer(out.serverId)?.stop();
    }
  });
});
