/**
 * The stray error codes fold into wire v1 (CLI-4). Each face gives a code of `ERROR_CODES`:
 *
 * - A stopped `HttpServerTransport` answers `UNAVAILABLE` (503), not `SERVER_STOPPED`.
 * - A refusal of the browser checks is `FORBIDDEN` (403) with a reason, not `FORBIDDEN_HOST`,
 *   `FORBIDDEN_ORIGIN`, `METHOD_NOT_ALLOWED` (405) or `UNSUPPORTED_MEDIA_TYPE` (415).
 *   `browser-guard.test.ts` and `csrf.test.ts` examine each check.
 * - An error outside a handler of `Server` is `INTERNAL_ERROR`, not the string `"500"`.
 *
 * The client reads the old codes of an older server as their new codes for one release.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Server } from "./server.js";
import { ServerError } from "./types.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";
import { HttpTransport } from "../adapters/http/client/transport.js";
import { itemOfFrame } from "../adapters/websocket/shared/rpc.js";
import type { WebSocketMessage } from "../adapters/websocket/server/types.js";
import { pathToMethod } from "./method.js";
import { ERROR_CODES, foldedErrorCode, isProtocolErrorCode } from "../protocol.js";
import { isAvailabilityFailure } from "../client/middleware/items.js";
import type { Message, ResponseItem } from "../client/types.js";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A `Server` with one handler, and a middleware that throws when the request asks for it. */
function rpcServer(): Server {
  const server = new Server();
  server.register({ service: "t", operation: "run" }, async (req) => ({ id: req.id, status: { type: "success", code: 200 }, payload: { ok: true }, metadata: {} }));
  server.use((next) => async (context) => {
    if ((context.request.payload as { fail?: unknown } | undefined)?.fail === true) throw new Error("the middleware failed");
    return next(context);
  });
  return server;
}

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

/** A JSON POST to the transport: the status and the parsed body. */
function post(port: number, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/t/run", headers: { "content-type": "application/json" } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

/** The first item of a `HttpTransport` whose `fetch` answers with the status and the JSON body. */
async function clientItem(status: number, body: unknown): Promise<ResponseItem<unknown>> {
  const fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof globalThis.fetch;
  const transport = new HttpTransport({ baseUrl: "https://api.example/api", fetch });
  const message: Message = { id: "m1", method: pathToMethod(["t", "run"]), payload: {}, metadata: {} };
  for await (const item of transport.send(message)) return item;
  throw new Error("The transport gave no item");
}

describe("the server faces give the codes of wire v1 (CLI-4)", () => {
  it("a stopped HttpServerTransport answers UNAVAILABLE (503), retryable, not SERVER_STOPPED", async () => {
    const app = express();
    const http = createServer(app);
    const transport = new HttpServerTransport(rpcServer(), { app, httpServer: http });
    await transport.start();
    const port = await listen(http);
    expect((await post(port, {})).status).toBe(200);
    // The listener belongs to the caller, so it stays open after stop()
    await transport.stop();
    expect(await post(port, {})).toEqual({ status: 503, body: { error: "The server is stopping", code: "UNAVAILABLE", retryable: true } });
  });

  it("Server answers an error outside a handler with INTERNAL_ERROR (500), not the code \"500\"", async () => {
    const server = rpcServer();
    const response = await server.handle({ id: "r1", method: { service: "t", operation: "run" }, payload: { fail: true }, metadata: {} });
    expect(response.status).toEqual({ type: "error", code: "INTERNAL_ERROR", message: "the middleware failed", retryable: false });

    const app = express();
    const http = createServer(app);
    const transport = new HttpServerTransport(server, { app, httpServer: http });
    await transport.start();
    cleanups.push(() => transport.stop());
    const port = await listen(http);
    expect(await post(port, { fail: true })).toEqual({ status: 500, body: { error: "the middleware failed", code: "INTERNAL_ERROR", retryable: false } });
  });

  it("ServerError has the code INTERNAL_ERROR by default", () => {
    expect(new ServerError("x")).toMatchObject({ code: "INTERNAL_ERROR", retryable: false });
    expect(new ServerError("x", "CONFLICT", true)).toMatchObject({ code: "CONFLICT", retryable: true });
  });

  it("each code that the faces give is a code of the protocol", () => {
    for (const code of ["UNAVAILABLE", "FORBIDDEN", "INTERNAL_ERROR"]) expect(isProtocolErrorCode(code), code).toBe(true);
    expect(ERROR_CODES.UNAVAILABLE).toMatchObject({ http: 503, retryable: true });
    expect(ERROR_CODES.FORBIDDEN).toMatchObject({ http: 403, retryable: false });
    expect(ERROR_CODES.INTERNAL_ERROR).toMatchObject({ http: 500, retryable: false });
    for (const code of ["SERVER_STOPPED", "FORBIDDEN_HOST", "FORBIDDEN_ORIGIN", "METHOD_NOT_ALLOWED", "UNSUPPORTED_MEDIA_TYPE", "500"]) {
      expect(isProtocolErrorCode(code), code).toBe(false);
    }
  });
});

describe("the client reads the old codes of an older server (CLI-4, for one release)", () => {
  it("foldedErrorCode gives the code and the reason of wire v1", () => {
    expect(foldedErrorCode("SERVER_STOPPED")).toEqual({ code: "UNAVAILABLE" });
    expect(foldedErrorCode("FORBIDDEN_HOST")).toEqual({ code: "FORBIDDEN", reason: "host-header-not-allowed" });
    expect(foldedErrorCode("FORBIDDEN_ORIGIN")).toEqual({ code: "FORBIDDEN", reason: "origin-not-allowed" });
    expect(foldedErrorCode("500")).toEqual({ code: "INTERNAL_ERROR" });
    // These two are also the codes of the HTTP statuses 405 and 415 of each server
    expect(foldedErrorCode("METHOD_NOT_ALLOWED")).toEqual({ code: "METHOD_NOT_ALLOWED" });
    expect(foldedErrorCode("UNSUPPORTED_MEDIA_TYPE")).toEqual({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(foldedErrorCode("CONFLICT")).toEqual({ code: "CONFLICT" });
    expect(foldedErrorCode("__proto__")).toEqual({ code: "__proto__" });
  });

  it("HttpTransport reads SERVER_STOPPED as UNAVAILABLE, a failure of availability", async () => {
    const item = await clientItem(503, { error: "Server stopped", code: "SERVER_STOPPED", retryable: true });
    expect(item.status).toEqual({ type: "error", code: "UNAVAILABLE", message: "Server stopped", retryable: true });
    expect(isAvailabilityFailure(item.status)).toBe(true);
    // A code of an older server that reaches the middleware without a transport of this package
    expect(isAvailabilityFailure({ code: "SERVER_STOPPED" })).toBe(true);
  });

  it("HttpTransport reads FORBIDDEN_HOST and FORBIDDEN_ORIGIN as FORBIDDEN with the reason", async () => {
    const host = await clientItem(403, { error: "Forbidden: the host \"x\" is not allowed", code: "FORBIDDEN_HOST", retryable: false });
    expect([host.status.type === "error" && host.status.code, host.metadata["reason"]]).toEqual(["FORBIDDEN", "host-header-not-allowed"]);
    const origin = await clientItem(403, { error: "Forbidden: the origin \"y\" is not allowed", code: "FORBIDDEN_ORIGIN", retryable: false });
    expect([origin.status.type === "error" && origin.status.code, origin.metadata["reason"]]).toEqual(["FORBIDDEN", "origin-not-allowed"]);
  });

  it("HttpTransport keeps the reason of a server of wire v1, and reads \"500\" as INTERNAL_ERROR", async () => {
    const current = await clientItem(403, { error: "no", code: "FORBIDDEN", retryable: false, reason: "media-type-not-allowed" });
    expect([current.status.type === "error" && current.status.code, current.metadata["reason"]]).toEqual(["FORBIDDEN", "media-type-not-allowed"]);
    const internal = await clientItem(500, { error: "boom", code: "500", retryable: false });
    expect(internal.status).toEqual({ type: "error", code: "INTERNAL_ERROR", message: "boom", retryable: false });
    expect(internal.metadata["reason"]).toBeUndefined();
  });

  it("a WebSocket frame with the code \"500\" gives INTERNAL_ERROR", () => {
    const response = { type: "response", id: "m1", status: { type: "error", code: "500", message: "boom", retryable: false } } as unknown as WebSocketMessage;
    expect(itemOfFrame(response, "m1").status).toEqual({ type: "error", code: "INTERNAL_ERROR", message: "boom", retryable: false });
    const error = { type: "error", id: "m1", error: { code: "500", message: "boom" } } as unknown as WebSocketMessage;
    expect(itemOfFrame(error, "m1").status).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
  });
});
