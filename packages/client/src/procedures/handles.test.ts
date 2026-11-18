/**
 * The handle scope of a caller (d40-handles): the objects with a state, with an owner and an end.
 */

import { describe, expect, it } from "vitest";
import * as z from "zod";
import { createRegistry } from "./module.js";
import { describeRegistry } from "./manifest.js";
import { forwardedModule } from "./forward.js";
import { HandleError, HandleScope, HANDLE_KEYWORD, handleSchema, isHandleRef, type HandleRef } from "./handles.js";
import { handleModule } from "./handle-procedures.js";
import { handleScopeOf } from "./handles.js";
import type { AnyProcedure, ProcedureContext, ProcedureModule } from "./types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { pathToMethod } from "../server/method.js";

/** An object with a state that records its close. */
class Resource {
  closed = 0;
  readonly name: string;
  readonly log: string[];
  constructor(name: string, log: string[] = []) {
    this.name = name;
    this.log = log;
  }
  close(): void {
    this.closed += 1;
    this.log.push(this.name);
  }
}

function clock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let at = start;
  return { now: () => at, advance: (ms) => (at += ms) };
}

async function rejection(promise: Promise<unknown> | (() => unknown)): Promise<HandleError> {
  try {
    await (typeof promise === "function" ? promise() : promise);
  } catch (error) {
    return error as HandleError;
  }
  throw new Error("expected an error");
}

describe("HandleScope", () => {
  it("keeps an object and gives it back for its handle, with its kind", () => {
    const time = clock();
    const scope = new HandleScope({ now: time.now });
    const db = new Resource("a");
    const ref = scope.open("test.Database", db, { label: "/data/a.db" });
    expect(ref.handle).toMatch(/^h_[0-9a-f]{32}$/);
    expect(isHandleRef(ref)).toBe(true);
    time.advance(5);
    expect(scope.get(ref, "test.Database")).toBe(db);
    expect(scope.get<Resource>(ref.handle)).toBe(db);
    expect(scope.has(ref)).toBe(true);
    expect(scope.list()).toEqual([{ handle: ref.handle, kind: "test.Database", label: "/data/a.db", openedAt: 1_000, usedAt: 1_005 }]);
  });

  it("refuses a handle of another kind, a closed handle and a handle of another scope", async () => {
    const first = new HandleScope();
    const second = new HandleScope();
    const ref = first.open("test.Database", new Resource("a"));
    expect(await rejection(() => first.get(ref, "test.Page"))).toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("is a test.Database, not a test.Page") });
    expect(await rejection(() => second.get(ref))).toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("is not open for this caller") });
    expect(await first.close(ref)).toBe(true);
    expect(await first.close(ref)).toBe(false);
    expect(await rejection(() => first.get(ref))).toBeInstanceOf(HandleError);
  });

  it("closes with the close function of the open, or Symbol.asyncDispose, Symbol.dispose or close()", async () => {
    const scope = new HandleScope();
    const calls: string[] = [];
    const disposable = { [Symbol.asyncDispose]: async () => void calls.push("asyncDispose"), close: () => calls.push("close of disposable") };
    const syncDisposable = { [Symbol.dispose]: () => void calls.push("dispose") };
    const plain = new Resource("plain", calls);
    const custom = new Resource("custom");
    const refs = [
      scope.open("a", disposable),
      scope.open("b", syncDisposable),
      scope.open("c", plain),
      scope.open("d", custom, { close: () => void calls.push("custom close") }),
      scope.open("e", 7),
    ];
    for (const ref of refs) expect(await scope.close(ref)).toBe(true);
    expect(calls).toEqual(["asyncDispose", "dispose", "plain", "custom close"]);
    expect(custom.closed).toBe(0);
  });

  it("removes a handle whose close fails, and throws the error of the close", async () => {
    const scope = new HandleScope();
    const ref = scope.open("test.Broken", { close: () => Promise.reject(new Error("the disk is gone")) });
    await expect(scope.close(ref)).rejects.toThrow("the disk is gone");
    expect(scope.size).toBe(0);
  });

  it("refuses an open over its limit, and opens again after a close", async () => {
    const scope = new HandleScope({ maxHandles: 2 });
    const first = scope.open("test.Database", new Resource("a"));
    scope.open("test.Database", new Resource("b"));
    expect(await rejection(() => scope.open("test.Database", new Resource("c")))).toMatchObject({ code: "RATE_LIMITED", retryable: false, message: expect.stringContaining("Close a handle with handle.close") });
    await scope.close(first);
    expect(isHandleRef(scope.open("test.Database", new Resource("c")))).toBe(true);
  });

  it("ends: it closes each object, the last open first, reports each failed close, and opens no more", async () => {
    const scope = new HandleScope();
    const log: string[] = [];
    scope.open("test.Database", new Resource("a", log));
    const broken = scope.open("test.Broken", { close: () => { throw new Error("no close"); } });
    scope.open("test.Database", new Resource("c", log));
    const report = await scope.end();
    expect(log).toEqual(["c", "a"]);
    expect(report.closed).toBe(2);
    expect(report.failed).toEqual([{ handle: broken.handle, kind: "test.Broken", error: new Error("no close") }]);
    expect(scope.ended).toBe(true);
    expect(scope.size).toBe(0);
    expect(await rejection(() => scope.open("test.Database", new Resource("d")))).toMatchObject({ code: "NOT_ACCEPTABLE" });
  });

  it("closes an object that no call used for the idle time limit, at the next operation", async () => {
    const time = clock();
    const scope = new HandleScope({ idleMs: 1_000, now: time.now });
    const idle = new Resource("idle");
    const used = new Resource("used");
    const idleRef = scope.open("test.Database", idle);
    const usedRef = scope.open("test.Database", used);
    time.advance(600);
    scope.get(usedRef);
    time.advance(600);
    expect(scope.list().map((info) => info.handle)).toEqual([usedRef.handle]);
    await Promise.resolve();
    await Promise.resolve();
    expect(idle.closed).toBe(1);
    expect(used.closed).toBe(0);
    expect(scope.has(idleRef)).toBe(false);
  });

  it("gives the JSON Schema of a handle with the keyword of its kind", () => {
    expect(handleSchema("test.Database")).toMatchObject({
      type: "object",
      properties: { handle: { type: "string", minLength: 1 } },
      required: ["handle"],
      additionalProperties: false,
      [HANDLE_KEYWORD]: "test.Database",
    });
    expect(isHandleRef({ handle: 7 })).toBe(false);
    expect(isHandleRef(null)).toBe(false);
  });
});

/** Procedures that open, read and close an object with a state through the scope of the caller. */
function databaseModule(opened: Resource[]): ProcedureModule {
  const open: AnyProcedure = {
    path: ["db", "open"],
    input: z.object({ name: z.string() }),
    output: z.object({ handle: z.string() }),
    metadata: { description: "This procedure opens a database.", effects: { reads: [], writes: ["handles"] } },
    handler: async (input: { name: string }, ctx: ProcedureContext) => {
      const db = new Resource(input.name);
      opened.push(db);
      return handleScopeOf(ctx).open("test.Database", db, { label: input.name });
    },
  } as AnyProcedure;
  const name: AnyProcedure = {
    path: ["db", "name"],
    input: z.object({ db: z.object({ handle: z.string() }) }),
    output: z.string(),
    metadata: { description: "This procedure gives the name of a database.", effects: { reads: ["handles"], writes: [] } },
    handler: async (input: { db: HandleRef }, ctx: ProcedureContext) => handleScopeOf(ctx).get<Resource>(input.db, "test.Database").name,
  } as AnyProcedure;
  const openAndName: AnyProcedure = {
    path: ["db", "openAndName"],
    input: z.object({ name: z.string() }),
    output: z.object({ handle: z.string(), name: z.string() }),
    metadata: { description: "This procedure opens a database through a nested call.", effects: { reads: ["handles"], writes: ["handles"] } },
    handler: async (input: { name: string }, ctx: ProcedureContext) => {
      const ref = await ctx.client.call<{ name: string }, HandleRef>(["db", "open"], { name: input.name });
      return { handle: ref.handle, name: await ctx.client.call<{ db: HandleRef }, string>(["db", "name"], { db: ref }) };
    },
  } as AnyProcedure;
  return { name: "db", procedures: [open, name, openAndName], requires: [handleModule] };
}

function serverOf(module: ProcedureModule): ProcedureServer {
  const server = new ProcedureServer({ registry: createRegistry(module) });
  server.registerFromRegistry();
  return server;
}

async function call(server: ProcedureServer, path: string[], payload: unknown, handles?: HandleScope): Promise<{ type: string; code?: string; value: unknown }> {
  const response = await server.handle({ id: "1", method: pathToMethod(path), payload, metadata: {}, ...(handles ? { handles } : {}) });
  const status = response.status as { type: string; code?: string };
  return { type: status.type, ...(status.type === "error" ? { code: String(status.code) } : {}), value: response.payload };
}

describe("the handle scope of a request", () => {
  it("reaches the handler and its nested calls, and handle.list and handle.close use it", async () => {
    const opened: Resource[] = [];
    const server = serverOf(databaseModule(opened));
    const session = new HandleScope();
    const result = (await call(server, ["db", "openAndName"], { name: "orders" }, session)).value as { handle: string; name: string };
    expect(result.name).toBe("orders");
    expect(session.size).toBe(1);

    const list = await call(server, ["handle", "list"], {}, session);
    expect(list.value).toMatchObject({ count: 1, handles: [{ handle: result.handle, kind: "test.Database", label: "orders" }] });
    expect(await call(server, ["db", "name"], { db: { handle: result.handle } }, session)).toEqual({ type: "success", value: "orders" });

    expect(await call(server, ["handle", "close"], { handle: result.handle }, session)).toEqual({ type: "success", value: { closed: true } });
    expect(opened[0]!.closed).toBe(1);
    expect(await call(server, ["handle", "close"], { handle: result.handle }, session)).toEqual({ type: "success", value: { closed: false } });
  });

  it("keeps the handles of two owners apart", async () => {
    const server = serverOf(databaseModule([]));
    const first = new HandleScope();
    const second = new HandleScope();
    const ref = (await call(server, ["db", "open"], { name: "a" }, first)).value as HandleRef;
    expect(await call(server, ["db", "name"], { db: ref }, second)).toMatchObject({ type: "error", code: "VALIDATION_ERROR" });
    expect((await call(server, ["handle", "list"], {}, second)).value).toEqual({ handles: [], count: 0 });
  });

  it("refuses an open with NOT_ACCEPTABLE when the face keeps no handles", async () => {
    const opened: Resource[] = [];
    const server = serverOf(databaseModule(opened));
    expect(await call(server, ["db", "open"], { name: "a" })).toMatchObject({ type: "error", code: "NOT_ACCEPTABLE" });
    expect(await call(server, ["handle", "list"], {})).toMatchObject({ type: "error", code: "NOT_ACCEPTABLE" });
  });

  it("is not forwarded: a module of a peer leaves out handle.list and handle.close", () => {
    const manifest = describeRegistry(createRegistry(databaseModule([])));
    expect(manifest.procedures.map((entry) => entry.path.join("."))).toContain("handle.list");
    const forwarded = forwardedModule(manifest, async () => undefined, { name: "peer" });
    const paths = forwarded.procedures.map((procedure) => procedure.path.join("."));
    expect(paths).toContain("db.open");
    expect(paths.filter((path) => path.startsWith("handle.") || path.startsWith("client.") || path.startsWith("procedure."))).toEqual([]);
  });
});
