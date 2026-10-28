/**
 * The rules of one face (CLI-43, AG1-B): `faceRules()`, and the expose rule of a request
 * (`ServerRequest.expose`) in `ProcedureServer`.
 *
 * - `apply()` adds the narrowing as one more source of the narrowing key, and meets the expose rule
 *   with the rule of the request. Without rules, it gives the same request.
 * - A narrowing that is not valid throws, with the name of the face.
 * - The server refuses a path outside the rule of the request with `NOT_FOUND`: a procedure, a
 *   handler of `register()` and an `alwaysOn` pin. A nested call of a data-driven procedure gets
 *   `NOT_EXPOSED`. A rule that is not a function admits no path.
 */

import { describe, it, expect } from "vitest";
import { faceRules, meetExpose } from "./face-rules.js";
import { ProcedureServer } from "./procedure-server.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { coreProcedures } from "../procedures/core/index.js";
import { NARROWING_METADATA_KEY } from "../procedures/narrowing.js";
import type { ProcedurePath } from "../procedures/types.js";
import type { ServerRequest } from "./types.js";

const POLICY = { capabilityOf: undefined, clearanceOrder: undefined };

function request(service: string, operation: string, payload: unknown = {}, extra: Partial<ServerRequest> = {}): ServerRequest {
  return { id: "1", method: { service, operation }, payload, metadata: {}, ...extra };
}

describe("faceRules", () => {
  it("gives the same request without rules", () => {
    const rules = faceRules({}, POLICY);
    const given = request("notes", "read");
    expect(rules.apply(given)).toBe(given);
    expect(rules.narrowings).toEqual([]);
    expect(rules.expose).toBeUndefined();
  });

  it("adds the narrowing as one more source, after the sources of the caller", () => {
    const rules = faceRules({ narrowing: { effects: { writes: [] } } }, POLICY);
    const given = request("notes", "read", {}, { metadata: { [NARROWING_METADATA_KEY]: { effects: { writes: "any" } } } });
    const applied = rules.apply(given);
    expect(applied.metadata[NARROWING_METADATA_KEY]).toEqual([{ effects: { writes: "any" } }, { effects: { writes: [] } }]);
    // The request that the face got does not change
    expect(given.metadata[NARROWING_METADATA_KEY]).toEqual({ effects: { writes: "any" } });
    expect(rules.capability?.effects?.writes).toEqual([]);
    expect(Object.isFrozen(rules.narrowings)).toBe(true);
  });

  it("reads the patterns, a tool surface or a function, and meets the rule of the request", () => {
    expect(faceRules({ expose: ["notes.*"] }, POLICY).expose!(["notes", "read"])).toBe(true);
    expect(faceRules({ expose: ["notes.*"] }, POLICY).expose!(["admin", "peek"])).toBe(false);
    const surface = faceRules({ expose: { namespaces: ["notes"], exclude: ["notes.write"] } }, POLICY).expose!;
    expect([surface(["notes", "read"]), surface(["notes", "write"])]).toEqual([true, false]);
    const own = (path: ProcedurePath): boolean => path[0] === "notes";
    expect(faceRules({ expose: own }, POLICY).expose).toBe(own);

    const rules = faceRules({ expose: ["notes.*", "admin.*"] }, POLICY);
    const outer = rules.apply(request("notes", "read", {}, { expose: (path) => path[0] !== "admin" }));
    expect([outer.expose!(["notes", "read"]), outer.expose!(["admin", "peek"]), outer.expose!(["host", "info"])]).toEqual([true, false, false]);
  });

  it("throws for a narrowing that is not valid, with the name of the face", () => {
    const bad = { efects: { writes: [] } } as never;
    expect(() => faceRules({ narrowing: bad }, POLICY, "HTTP")).toThrow("The narrowing of the HTTP face is not valid");
    expect(() => faceRules({ narrowing: bad }, POLICY)).toThrow("The narrowing of the face is not valid");
  });

  it("meets two rules, and keeps one rule alone", () => {
    const first = (path: ProcedurePath): boolean => path[0] === "a";
    expect(meetExpose(first, undefined)).toBe(first);
    expect(meetExpose(undefined, first)).toBe(first);
    expect(meetExpose(undefined, undefined)).toBeUndefined();
    const both = meetExpose(first, (path) => path[1] === "b")!;
    expect([both(["a", "b"]), both(["a", "c"]), both(["x", "b"])]).toEqual([true, false, false]);
  });
});

describe("the expose rule of a request in ProcedureServer (AG1-B)", () => {
  function makeServer(): { server: ProcedureServer; ran: string[] } {
    const ran: string[] = [];
    const registry = new ProcedureRegistry();
    for (const procedure of coreProcedures) registry.register(procedure);
    for (const name of ["read", "peek"]) {
      registry.register(
        defineProcedure({
          path: ["notes", name],
          input: outputSchema<unknown>(),
          output: outputSchema<string>(),
          metadata: { effects: { reads: [], writes: [] } },
          handler: () => {
            ran.push(name);
            return name;
          },
        }),
      );
    }
    const server = new ProcedureServer({ registry, autoRegister: true });
    server.register({ service: "raw", operation: "handler" }, async (req) => {
      ran.push("raw");
      return { id: req.id, status: { type: "success", code: 200 }, payload: "raw", metadata: {} };
    });
    return { server, ran };
  }
  const onlyRead = (path: ProcedurePath): boolean => path.join(".") === "notes.read" || path.join(".") === "client.chain";

  it("serves a path inside the rule, and refuses the others with NOT_FOUND", async () => {
    const { server, ran } = makeServer();
    expect((await server.handle(request("notes", "read", {}, { expose: onlyRead }))).payload).toBe("read");
    expect((await server.handle(request("notes", "peek", {}, { expose: onlyRead }))).status).toMatchObject({ code: "NOT_FOUND" });
    expect((await server.handle(request("raw", "handler", {}, { expose: onlyRead }))).status).toMatchObject({ code: "NOT_FOUND" });
    expect(ran).toEqual(["read"]);
    // A request without a rule reaches each handler, as before
    expect((await server.handle(request("raw", "handler"))).payload).toBe("raw");
    expect((await server.handle(request("notes", "peek"))).payload).toBe("peek");
  });

  it("refuses a nested call of client.chain outside the rule", async () => {
    const { server, ran } = makeServer();
    const steps = (name: string) => ({ steps: [{ $proc: ["notes", name], input: {} }] });
    expect((await server.handle(request("client", "chain", steps("read"), { expose: onlyRead }))).status.type).toBe("success");
    expect((await server.handle(request("client", "chain", steps("peek"), { expose: onlyRead }))).status).toMatchObject({ code: "NOT_EXPOSED" });
    expect(ran).toEqual(["read"]);
  });

  it("admits no path for a rule that is not a function", async () => {
    const { server, ran } = makeServer();
    const wrong = request("notes", "read", {}, { expose: true as never });
    expect((await server.handle(wrong)).status).toMatchObject({ code: "NOT_FOUND" });
    expect(ran).toEqual([]);
  });
});
