/**
 * server.start, server.stop and server.status are in this package, the package of the host. They
 * came from @procedures/peer with the same names, schemas and effects. The tests do not start the
 * handlers: they read and change the lockfiles of the CLI servers of this computer.
 */

import { describe, it, expect } from "vitest";
import { PROCEDURE_REGISTRY, createRegistry, effectsOf } from "@procedures/client";
import peerModule from "@procedures/peer/module";
import { serverModule } from "./module.js";
import { serverStartInputSchema, serverStatusInputSchema, serverStopInputSchema } from "./schemas.js";

describe("the module of @procedures/server", () => {
  it("has server.start, server.stop and server.status", () => {
    expect(serverModule.name).toBe("@procedures/server");
    expect(serverModule.procedures.map((procedure) => procedure.path.join("."))).toEqual(["server.start", "server.stop", "server.status"]);
  });

  it("declares the effects of each procedure", () => {
    for (const procedure of serverModule.procedures) {
      expect(effectsOf(procedure), procedure.path.join(".")).toBeDefined();
    }
  });

  it("does not overlap the module of the peer package", () => {
    const peerKeys = peerModule.procedures.map((procedure) => procedure.path.join("."));
    expect(peerKeys).not.toContain("server.start");
    expect(peerKeys).not.toContain("server.stop");
    expect(peerKeys).not.toContain("server.status");
    // One registry takes both modules
    const registry = createRegistry(peerModule, serverModule);
    expect(registry.has(["server", "create"])).toBe(true);
    expect(registry.has(["server", "start"])).toBe(true);
  });

  it("registers nothing from the root, and the three procedures from the register entry", async () => {
    const root = await import("./index.js");
    expect(root.serverModule).toBe(serverModule);
    expect(PROCEDURE_REGISTRY.has(["server", "start"])).toBe(false);
    await import("./register.js");
    for (const name of ["start", "stop", "status"]) {
      expect(PROCEDURE_REGISTRY.get(["server", name])?.handler, `server.${name}`).toBeDefined();
    }
  });
});

describe("the input schemas of server.start, server.stop and server.status", () => {
  it("accept valid input", () => {
    expect(serverStartInputSchema.parse({})).toEqual({});
    expect(serverStartInputSchema.parse({ port: 4000, host: "::1", transport: "both" })).toEqual({
      port: 4000,
      host: "::1",
      transport: "both",
    });
    expect(serverStopInputSchema.parse({ port: 1, force: true })).toEqual({ port: 1, force: true });
    expect(serverStatusInputSchema.parse({ port: 3000 })).toEqual({ port: 3000 });
  });

  it("reject an invalid port or transport", () => {
    expect(() => serverStartInputSchema.parse({ port: 70000 })).toThrow();
    expect(() => serverStartInputSchema.parse({ port: "abc" })).toThrow();
    expect(() => serverStartInputSchema.parse({ transport: "udp" })).toThrow();
    expect(() => serverStopInputSchema.parse({ port: 1.5 })).toThrow();
    expect(() => serverStatusInputSchema.parse({ port: 0 })).toThrow();
  });
});
