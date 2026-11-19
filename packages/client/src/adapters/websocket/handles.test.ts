/**
 * The handle scope of each WebSocket connection (d40-handles): a connection keeps its own objects
 * with a state, another connection cannot use them, and the close of the connection or the stop of
 * the server closes them.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as z from "zod";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "../../client/client.js";
import { handleModule } from "../../procedures/handle-procedures.js";
import { handleScopeOf, type HandleRef } from "../../procedures/handles.js";
import { createRegistry } from "../../procedures/module.js";
import type { AnyProcedure, ProcedureContext, ProcedureModule } from "../../procedures/types.js";
import { pathToMethod } from "../../server/method.js";
import { ProcedureServer } from "../../server/procedure-server.js";
import { WebSocketTransport } from "./client/transport.js";
import { WebSocketServerTransport } from "./server/transport.js";
import type { HandleScopeOptions } from "../../procedures/handles.js";

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => undefined);
  cleanups = [];
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("waitFor: condition not met");
    await sleep(5);
  }
}

/** An object with a state: a counter that counts its closes. */
class Tally {
  count = 0;
  closed = 0;
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  close(): void {
    this.closed += 1;
  }
}

/** The procedures `tally.open` and `tally.add`, which keep a tally in the scope of the caller. */
function tallyModule(opened: Tally[]): ProcedureModule {
  const open: AnyProcedure = {
    path: ["tally", "open"],
    input: z.object({ name: z.string() }),
    output: z.object({ handle: z.string() }),
    metadata: { description: "This procedure opens a tally.", effects: { reads: [], writes: ["handles"] } },
    handler: async (input: { name: string }, ctx: ProcedureContext) => {
      const tally = new Tally(input.name);
      opened.push(tally);
      return handleScopeOf(ctx).open("test.Tally", tally, { label: input.name });
    },
  } as AnyProcedure;
  const add: AnyProcedure = {
    path: ["tally", "add"],
    input: z.object({ tally: z.object({ handle: z.string() }), by: z.number() }),
    output: z.number(),
    metadata: { description: "This procedure adds to a tally.", effects: { reads: ["handles"], writes: [] } },
    handler: async (input: { tally: HandleRef; by: number }, ctx: ProcedureContext) => {
      const tally = handleScopeOf(ctx).get<Tally>(input.tally, "test.Tally");
      tally.count += input.by;
      return tally.count;
    },
  } as AnyProcedure;
  return { name: "tally", procedures: [open, add], requires: [handleModule] };
}

async function start(opened: Tally[], handles?: HandleScopeOptions) {
  const server = new ProcedureServer({ registry: createRegistry(tallyModule(opened)) });
  server.registerFromRegistry();
  const http: HttpServer = createServer();
  server.addTransport(new WebSocketServerTransport(server, { server: http, path: "/ws", heartbeat: false, ...(handles !== undefined ? { handles } : {}) }));
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  cleanups.push(() => server.stop());
  const url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`;
  const connect = () => {
    const transport = new WebSocketTransport({ url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    return { transport, client: new Client({ transport, throwOnError: true }) };
  };
  return { server, connect };
}

const call = <T>(client: Client, path: string[], payload: unknown): Promise<T> => client.call(pathToMethod(path), payload) as Promise<T>;
const failure = (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error);

describe("the handle scope of each WebSocket connection (d40-handles)", () => {
  it("resolves a handle on its connection, and keeps the handles of two connections apart", async () => {
    const opened: Tally[] = [];
    const { connect } = await start(opened);
    const one = connect();
    const two = connect();
    const ref = await call<HandleRef>(one.client, ["tally", "open"], { name: "orders" });
    expect(await call<number>(one.client, ["tally", "add"], { tally: ref, by: 2 })).toBe(2);
    expect(await call<number>(one.client, ["tally", "add"], { tally: ref, by: 3 })).toBe(5);
    expect(await call(one.client, ["handle", "list"], {})).toMatchObject({ count: 1, handles: [{ handle: ref.handle, kind: "test.Tally", label: "orders" }] });

    expect(await failure(call(two.client, ["tally", "add"], { tally: ref, by: 1 }))).toMatchObject({ status: { code: "VALIDATION_ERROR" } });
    expect(await call(two.client, ["handle", "list"], {})).toEqual({ handles: [], count: 0 });
    expect(opened[0]!.count).toBe(5);
  });

  it("closes the objects of a connection when the connection closes", async () => {
    const opened: Tally[] = [];
    const { connect } = await start(opened);
    const one = connect();
    const two = connect();
    await call(one.client, ["tally", "open"], { name: "a" });
    await call(one.client, ["tally", "open"], { name: "b" });
    await call(two.client, ["tally", "open"], { name: "c" });
    await one.transport.close();
    await waitFor(() => opened[0]!.closed === 1 && opened[1]!.closed === 1);
    // The objects of the other connection stay open
    expect(opened[2]!.closed).toBe(0);
    expect(await call(two.client, ["handle", "list"], {})).toMatchObject({ count: 1 });
  });

  it("closes the objects of each connection before the stop of the server ends", async () => {
    const opened: Tally[] = [];
    const { server, connect } = await start(opened);
    await call(connect().client, ["tally", "open"], { name: "a" });
    await call(connect().client, ["tally", "open"], { name: "b" });
    await server.stop();
    expect(opened.map((tally) => tally.closed)).toEqual([1, 1]);
  });

  it("takes the options of the scope: an open over maxHandles gets RATE_LIMITED", async () => {
    const opened: Tally[] = [];
    const { connect } = await start(opened, { maxHandles: 1 });
    const one = connect();
    await call(one.client, ["tally", "open"], { name: "a" });
    expect(await failure(call(one.client, ["tally", "open"], { name: "b" }))).toMatchObject({ status: { code: "RATE_LIMITED" } });
    // A new connection has its own scope, with its own limit
    expect(await call(connect().client, ["tally", "open"], { name: "c" })).toMatchObject({ handle: expect.stringMatching(/^h_/) });
  });
});
