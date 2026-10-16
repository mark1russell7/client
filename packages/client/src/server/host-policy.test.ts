/**
 * The policy of a host (roadmap 2.3): one builder for the expose rule, the call rule, the time
 * limit and the token of every host.
 */

import { describe, it, expect } from "vitest";
import { ProcedureServer } from "./procedure-server.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { createRegistry, defineModule } from "../procedures/module.js";
import type { AnyProcedure, ProcedureContext } from "../procedures/types.js";
import { exposePatterns, hostPolicy, procedureServerOptions, surfaceRule } from "./host-policy.js";
import { ms } from "../duration.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const proc = (path: string[], handler: (input: never, ctx: ProcedureContext) => unknown, calls?: string[]): AnyProcedure =>
  defineProcedure({
    path,
    input: outputSchema<unknown>(),
    output: outputSchema<unknown>(),
    ...(calls ? { metadata: { calls } } : {}),
    handler: handler as never,
  }) as AnyProcedure;

const testModule = defineModule("host-policy-test", [
  proc(["shell", "run"], () => "ran"),
  proc(["tool", "declared"], (_input, ctx) => ctx.client.call(["shell", "run"], {}), ["shell.run"]),
  proc(["tool", "undeclared"], (_input, ctx) => ctx.client.call(["shell", "run"], {})),
  proc(["tool", "slow"], async () => {
    await sleep(200);
    return "late";
  }),
  proc(["tool", "hidden"], () => "hidden"),
]);

async function call(server: ProcedureServer, path: string[]): Promise<{ type: string; code?: string; value?: unknown }> {
  const response = await server.handle({
    id: "1",
    method: { service: path.slice(0, -1).join("."), operation: path[path.length - 1]! },
    payload: {},
    metadata: {},
  });
  const status = response.status as { type: string; code?: string };
  return { type: status.type, ...(status.code ? { code: status.code } : {}), value: (response as { payload?: unknown }).payload };
}

describe("exposePatterns and surfaceRule", () => {
  it("match exact keys, prefixes and everything", () => {
    const rule = exposePatterns(["git.status", "mongo.*"]);
    expect(rule(["git", "status"])).toBe(true);
    expect(rule(["mongo", "documents", "find"])).toBe(true);
    expect(rule(["mongodb", "x"])).toBe(false);
    expect(exposePatterns(["*"])(["shell", "exec"])).toBe(true);
  });

  it("give the namespaces of a surface, less its excluded keys", () => {
    const rule = surfaceRule({ namespaces: ["vitest"], exclude: ["vitest.watch"] });
    expect(rule(["vitest", "run"])).toBe(true);
    expect(rule(["vitest", "watch"])).toBe(false);
    expect(rule(["shell", "run"])).toBe(false);
  });
});

describe("hostPolicy", () => {
  it("takes patterns, a surface or a rule, and an exclude list over all of them", () => {
    expect(hostPolicy({ expose: ["tool.*"], exclude: ["tool.hidden"] }).expose?.(["tool", "hidden"])).toBe(false);
    expect(hostPolicy({ expose: { namespaces: ["tool"] } }).expose?.(["tool", "slow"])).toBe(true);
    expect(hostPolicy({ expose: (path) => path[0] === "x" }).expose?.(["x", "y"])).toBe(true);
    // An exclude list alone hides only its keys
    const excludeOnly = hostPolicy({ exclude: ["shell.run"] }).expose!;
    expect(excludeOnly(["shell", "run"])).toBe(false);
    expect(excludeOnly(["tool", "slow"])).toBe(true);
    expect(hostPolicy().expose).toBeUndefined();
  });

  it("adds a time limit only when there is one, before the other interceptors", () => {
    expect(hostPolicy().interceptors).toHaveLength(0);
    const own = async (_invocation: unknown, next: () => Promise<unknown>) => next();
    const policy = hostPolicy({ timeout: ms(50), interceptors: [own as never] });
    expect(policy.interceptors).toHaveLength(2);
    expect(policy.interceptors[1]).toBe(own);
  });

  it("gives a ProcedureServer the expose rule, the call rule and the time limit", async () => {
    const policy = hostPolicy({ expose: ["tool.*"], exclude: ["tool.hidden"], strictCalls: true, timeout: ms(50) });
    const server = new ProcedureServer(procedureServerOptions(policy, createRegistry(testModule)));
    expect(await call(server, ["tool", "hidden"])).toMatchObject({ type: "error" });
    expect(await call(server, ["shell", "run"])).toMatchObject({ type: "error" });
    // A declared nested call reaches the hidden procedure; an undeclared one does not (strictCalls)
    expect(await call(server, ["tool", "declared"])).toMatchObject({ type: "success" });
    expect(await call(server, ["tool", "undeclared"])).toMatchObject({ type: "error" });
    expect(await call(server, ["tool", "slow"])).toMatchObject({ type: "error", code: "TIMEOUT" });
  });

  it("keeps the token and the browser checks for the network transports", () => {
    const policy = hostPolicy({ token: "t", browser: { allowedOrigins: ["https://app.example"] } });
    expect(policy.token).toBe("t");
    expect(policy.browser.allowedOrigins).toEqual(["https://app.example"]);
  });
});
