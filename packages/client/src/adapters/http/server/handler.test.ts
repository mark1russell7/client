/**
 * The procedure handler of HTTP without a framework (CLI-3): it mounts at a path of a `node:http`
 * server next to the routes of the application, it speaks wire protocol v1, and it has the stop
 * parts of a service transport.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { fakeClock } from "@mark1russell7/service/testing";
import { createProcedure } from "../../../procedures/define.js";
import { createRegistry } from "../../../procedures/module.js";
import { ProcedureServer, type ProcedureServerOptions } from "../../../server/procedure-server.js";
import { pathToMethod } from "../../../server/method.js";
import { Client } from "../../../client/client.js";
import { HttpTransport } from "../client/transport.js";
import { procedureHandler, type NodeProcedureHandler, type ProcedureHandlerOptions } from "./handler.js";
import { rpcServerUrlStrategy } from "./strategies.js";
import { feedOf, openStream, type Feed } from "../../../../test/streams.js";
import { seconds } from "../../../duration.js";

const read = { reads: [], writes: [] };

function registry(feed?: Feed) {
  let writes = 0;
  const reg = createRegistry({
    name: "proc",
    procedures: [
      createProcedure()
        .path(["proc", "echo"])
        .input(z.object({ text: z.string() }))
        .output(z.object({ text: z.string() }))
        .meta({ effects: read })
        .handler(async (input) => ({ text: input.text }))
        .build(),
      createProcedure()
        .path(["proc", "count"])
        .input(z.object({ to: z.number() }))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (input: { to: number }) {
          for (let n = 1; n <= input.to; n++) yield n;
        } as never)
        .build(),
      createProcedure()
        .path(["proc", "feed"])
        .input(z.object({}))
        .output(z.number())
        .meta({ effects: read })
        .handler(async function* (_input: unknown, ctx: { signal?: AbortSignal }) {
          if (feed) yield* feed.items(ctx.signal);
        } as never)
        .build(),
      createProcedure()
        .path(["proc", "write"])
        .input(z.object({}))
        .output(z.number())
        .meta({ effects: { writes: ["data"] } })
        .handler(async () => ++writes)
        .build(),
      createProcedure()
        .path(["proc", "meta"])
        .input(z.object({}).passthrough())
        .output(z.unknown())
        .meta({ effects: read })
        .handler(async (_input, ctx) => ctx.metadata)
        .build(),
      createProcedure()
        .path(["proc", "slow"])
        .input(z.object({}))
        .output(z.string())
        .meta({ effects: read })
        .handler(
          (_input, ctx) =>
            new Promise<string>((resolve, reject) => {
              const timer = setTimeout(() => resolve("late"), 5_000);
              ctx.signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(Object.assign(new Error("aborted"), { code: "ABORTED" }));
              });
            })
        )
        .build(),
    ],
  });
  return { reg, writes: () => writes };
}

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

async function listen(http: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

/** A raw node:http server: the procedures at /api/proc, then the routes of the application. */
async function startApp(
  options: ProcedureHandlerOptions = {},
  serverOptions: ProcedureServerOptions = {},
  feed?: Feed
): Promise<{ base: string; port: number; handler: NodeProcedureHandler; writes: () => number; appHits: string[] }> {
  const { reg, writes } = registry(feed);
  const server = new ProcedureServer({ registry: reg, ...serverOptions });
  server.registerFromRegistry();
  const handler = procedureHandler(server, { basePath: "/api/proc", ...options });
  const appHits: string[] = [];
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (handler(req, res)) return;
    appHits.push(req.url ?? "");
    res.setHeader("content-type", "text/plain");
    res.end(req.url === "/api/chat" ? "chat of the app" : "a route of the app");
  });
  const port = await listen(http);
  cleanups.push(() => handler.close());
  return { base: `http://127.0.0.1:${port}`, port, handler, writes, appHits };
}

/** A raw request with any headers, and its response. */
function send(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<{ status: number; headers: IncomingMessage["headers"]; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const JSON_HEADERS = { "content-type": "application/json" };

describe("procedureHandler: a mount on a raw node:http server (CLI-3)", () => {
  it("serves the procedures at /api/proc, and the other routes of /api reach the application", async () => {
    const { port, appHits } = await startApp();
    const value = await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, '{"text":"hi"}');
    expect(value.status).toBe(200);
    expect(JSON.parse(value.body)).toEqual({ text: "hi" });
    expect(value.headers["procedures-protocol"]).toBe("1");

    const chat = await send(port, "POST", "/api/chat", JSON_HEADERS, "{}");
    expect(chat.body).toBe("chat of the app");
    expect((await send(port, "GET", "/index.html")).body).toBe("a route of the app");
    // A path that only starts with the base path is not under it
    expect((await send(port, "POST", "/api/process", JSON_HEADERS, "{}")).body).toBe("a route of the app");
    expect(appHits).toEqual(["/api/chat", "/index.html", "/api/process"]);
  });

  it("gives false and does not touch a request outside its path", () => {
    const handler = procedureHandler(new ProcedureServer({ registry: registry().reg }), { basePath: "/api/proc" });
    const req = { url: "/api/chat", method: "POST", headers: {} } as IncomingMessage;
    const res = {} as ServerResponse;
    expect(handler(req, res)).toBe(false);
    expect(handler.matches(req)).toBe(false);
    expect(handler.matches({ ...req, url: "/api/proc/a/b?x=1" } as IncomingMessage)).toBe(true);
    // The absolute form of a request line, from a proxy
    expect(handler.matches({ ...req, url: "http://127.0.0.1:3000/api/proc/a/b" } as IncomingMessage)).toBe(true);
    expect(handler.matches({ ...req, url: "http://127.0.0.1:3000/api/chat" } as IncomingMessage)).toBe(false);
    expect(handler.basePath).toBe("/api/proc");
  });

  it("is a client's server: a value and an NDJSON stream through HttpTransport", async () => {
    const { base } = await startApp();
    const client = new Client(new HttpTransport({ baseUrl: `${base}/api/proc` }));
    expect(await client.call(pathToMethod(["proc", "echo"]), { text: "x" })).toEqual({ text: "x" });
    const items: unknown[] = [];
    for await (const item of client.stream(pathToMethod(["proc", "count"]), { to: 3 })) items.push(item);
    expect(items).toEqual([1, 2, 3]);
  });

  it("writes the NDJSON lines with seq, and the last item for a client without NDJSON", async () => {
    const { port } = await startApp();
    const ndjson = await send(port, "POST", "/api/proc/proc/count", { ...JSON_HEADERS, accept: "application/x-ndjson, application/json" }, '{"to":2}');
    expect(ndjson.headers["content-type"]).toBe("application/x-ndjson");
    expect(ndjson.body).toBe('{"type":"item","seq":1,"payload":1}\n{"type":"item","seq":2,"payload":2}\n{"type":"done","seq":3}\n');
    const sponge = await send(port, "POST", "/api/proc/proc/count", JSON_HEADERS, '{"to":2}');
    expect(JSON.parse(sponge.body)).toBe(2);
  });

  it("runs a keyed write one time, and a deadline of the caller ends a slow call", async () => {
    const { port, writes } = await startApp();
    const keyed = { ...JSON_HEADERS, "x-metadata": encodeURIComponent(JSON.stringify({ "idempotency-key": "k-1" })) };
    const first = await send(port, "POST", "/api/proc/proc/write", keyed, "{}");
    const again = await send(port, "POST", "/api/proc/proc/write", keyed, "{}");
    expect([JSON.parse(first.body), JSON.parse(again.body)]).toEqual([1, 1]);
    expect(writes()).toBe(1);

    const timed = { ...JSON_HEADERS, "x-metadata": encodeURIComponent(JSON.stringify({ "procedure-timeout": 20 })) };
    const slow = await send(port, "POST", "/api/proc/proc/slow", timed, "{}");
    expect(slow.status).toBe(504);
    expect(JSON.parse(slow.body).code).toBe("TIMEOUT");
  });

  it("maps the method with another URL strategy", async () => {
    const { reg } = registry();
    const server = new ProcedureServer({ registry: reg });
    server.registerFromRegistry();
    const handler = procedureHandler(server, { basePath: "/rpc", urlStrategy: rpcServerUrlStrategy });
    const http = createServer((req, res) => {
      if (!handler(req, res)) res.end("app");
    });
    const port = await listen(http);
    const res = await send(port, "POST", "/rpc/proc/echo", JSON_HEADERS, '{"text":"r"}');
    expect(JSON.parse(res.body)).toEqual({ text: "r" });
  });
});

describe("procedureHandler: the error codes of wire v1 (CLI-3)", () => {
  it("refuses a browser request with FORBIDDEN and a reason, and runs nothing", async () => {
    const { port, writes } = await startApp();
    const origin = await send(port, "POST", "/api/proc/proc/write", { ...JSON_HEADERS, origin: "https://evil.example" }, "{}");
    expect(origin.status).toBe(403);
    expect(JSON.parse(origin.body)).toEqual({ error: 'Forbidden: the origin "https://evil.example" is not allowed', code: "FORBIDDEN", retryable: false, reason: "origin-not-allowed" });
    const get = await send(port, "GET", "/api/proc/proc/write");
    expect([get.status, JSON.parse(get.body).reason]).toEqual([403, "method-not-allowed"]);
    const text = await send(port, "POST", "/api/proc/proc/write", { "content-type": "text/plain" }, "{}");
    expect([text.status, JSON.parse(text.body).reason]).toEqual([403, "media-type-not-allowed"]);
    const host = await send(port, "POST", "/api/proc/proc/write", { ...JSON_HEADERS, host: "evil.example" }, "{}");
    expect([host.status, JSON.parse(host.body).reason]).toEqual([403, "host-header-not-allowed"]);
    expect(writes()).toBe(0);
  });

  it("answers UNAVAILABLE after stopIntake(), and accepts again after start()", async () => {
    const { port, handler } = await startApp();
    handler.stopIntake();
    const stopped = await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, '{"text":"a"}');
    expect(stopped.status).toBe(503);
    expect(JSON.parse(stopped.body)).toEqual({ error: "The server is stopping", code: "UNAVAILABLE", retryable: true });
    handler.start();
    expect((await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, '{"text":"a"}')).status).toBe(200);
  });

  it("answers INVALID_REQUEST for a bad body, a bad X-Metadata header and a URL without a method, and PAYLOAD_TOO_LARGE for a large body", async () => {
    const { port } = await startApp({ bodyLimit: 16 });
    const bad = await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, "{nope");
    expect([bad.status, JSON.parse(bad.body).code]).toEqual([400, "INVALID_REQUEST"]);
    const large = await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, JSON.stringify({ text: "x".repeat(64) }));
    expect([large.status, JSON.parse(large.body).code]).toEqual([413, "PAYLOAD_TOO_LARGE"]);
    const header = await send(port, "POST", "/api/proc/proc/echo", { ...JSON_HEADERS, "x-metadata": "%7Bnot-json" }, "{}");
    expect([header.status, JSON.parse(header.body).code]).toEqual([400, "INVALID_REQUEST"]);
    // Four URL segments name no method. One segment names a path of one segment (CLI-28)
    const noMethod = await send(port, "POST", "/api/proc/a/b/c/d", JSON_HEADERS, "{}");
    expect([noMethod.status, JSON.parse(noMethod.body).code]).toEqual([400, "INVALID_REQUEST"]);
    const oneSegment = await send(port, "POST", "/api/proc/one", JSON_HEADERS, "{}");
    expect([oneSegment.status, JSON.parse(oneSegment.body).code]).toEqual([404, "NOT_FOUND"]);
  });

  it("answers a preflight with 204 and runs no procedure, also without CORS", async () => {
    const { port, writes } = await startApp();
    const preflight = await send(port, "OPTIONS", "/api/proc/proc/write");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    expect(writes()).toBe(0);
  });
});

describe("procedureHandler: CORS (CLI-3, CLI-18)", () => {
  it("names an allowed origin with credentials and Vary, and lets that origin call", async () => {
    const { port } = await startApp({ cors: { origin: ["https://app.example"], credentials: true, exposedHeaders: ["Procedures-Protocol"], maxAge: seconds(60) } });
    const preflight = await send(port, "OPTIONS", "/api/proc/proc/echo", { origin: "https://app.example", "access-control-request-method": "POST" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://app.example");
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
    expect(preflight.headers["vary"]).toBe("Origin");
    expect(String(preflight.headers["access-control-allow-headers"])).toContain("X-Metadata");
    expect(preflight.headers["access-control-expose-headers"]).toBe("Procedures-Protocol");
    expect(preflight.headers["access-control-max-age"]).toBe("60");

    const call = await send(port, "POST", "/api/proc/proc/echo", { ...JSON_HEADERS, origin: "https://app.example" }, '{"text":"c"}');
    expect(call.status).toBe(200);
    expect(call.headers["access-control-allow-origin"]).toBe("https://app.example");

    const other = await send(port, "POST", "/api/proc/proc/echo", { ...JSON_HEADERS, origin: "https://other.example" }, '{"text":"c"}');
    expect(other.status).toBe(403);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no Access-Control header to an origin that it does not permit, and Vary: Origin on each response (CLI-56)", async () => {
    const { port } = await startApp({ cors: { origin: ["https://app.example"], credentials: true, maxAge: seconds(60) } });
    const accessControl = (headers: IncomingMessage["headers"]): string[] => Object.keys(headers).filter((name) => name.startsWith("access-control-"));
    const preflight = await send(port, "OPTIONS", "/api/proc/proc/echo", { origin: "https://other.example", "access-control-request-method": "POST" });
    expect(preflight.status).toBe(204);
    expect(accessControl(preflight.headers)).toEqual([]);
    expect(preflight.headers["vary"]).toBe("Origin");
    const call = await send(port, "POST", "/api/proc/proc/echo", { ...JSON_HEADERS, origin: "https://other.example" }, '{"text":"c"}');
    expect(call.status).toBe(403);
    expect(accessControl(call.headers)).toEqual([]);
    expect(call.headers["vary"]).toBe("Origin");
    // A request without an origin gets no CORS header either, and the same Vary: a shared cache keeps one answer for each origin
    const plain = await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, '{"text":"c"}');
    expect(plain.status).toBe(200);
    expect(accessControl(plain.headers)).toEqual([]);
    expect(plain.headers["vary"]).toBe("Origin");
    // The permitted origin keeps each header
    const allowed = await send(port, "OPTIONS", "/api/proc/proc/echo", { origin: "https://app.example", "access-control-request-method": "POST" });
    expect(accessControl(allowed.headers).sort()).toEqual([
      "access-control-allow-credentials",
      "access-control-allow-headers",
      "access-control-allow-methods",
      "access-control-allow-origin",
      "access-control-max-age",
    ]);
  });

  it("sends no credentials header for the origin \"*\"", async () => {
    const { port } = await startApp({ cors: true });
    const preflight = await send(port, "OPTIONS", "/api/proc/proc/echo", { origin: "https://any.example" });
    expect(preflight.headers["access-control-allow-origin"]).toBe("*");
    expect(preflight.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("takes a function of the origin", async () => {
    const { port } = await startApp({ cors: { origin: (origin) => origin.endsWith(".trusted.example") } });
    const ok = await send(port, "POST", "/api/proc/proc/echo", { ...JSON_HEADERS, origin: "https://a.trusted.example" }, '{"text":"f"}');
    expect([ok.status, ok.headers["access-control-allow-origin"], ok.headers["access-control-allow-credentials"]]).toEqual([200, "https://a.trusted.example", "true"]);
    expect((await send(port, "POST", "/api/proc/proc/echo", { ...JSON_HEADERS, origin: "https://evil.example" }, "{}")).status).toBe(403);
  });
});

describe("procedureHandler: the secrets stay out of the metadata (CLI-2a)", () => {
  it("keeps the secret headers, the cookies and the token query out of the metadata", async () => {
    const { port } = await startApp({ secretHeaders: ["X-Jarvis-Token"] });
    const res = await send(
      port,
      "POST",
      "/api/proc/proc/meta?token=t-1&page=2",
      { ...JSON_HEADERS, cookie: "jarvis_token=c-1", authorization: "Bearer b-1", "x-jarvis-token": "h-1", "x-api-key": "k-1", "x-tenant": "a" },
      "{}"
    );
    const metadata = JSON.parse(res.body) as Record<string, unknown>;
    const text = JSON.stringify(metadata);
    for (const secret of ["c-1", "b-1", "h-1", "k-1", "t-1"]) expect(text).not.toContain(secret);
    expect(metadata["x-tenant"]).toBe("a");
    expect(metadata["page"]).toBe("2");
    expect(metadata["query"]).toEqual({ page: "2" });
  });
});

describe("procedureHandler: the stop parts of a service transport (CLI-3)", () => {
  it("counts an open stream, drains until the deadline, and close() ends the stream", async () => {
    const feed = feedOf();
    const clock = fakeClock();
    const { base, handler } = await startApp({ clock, keepAlive: false }, {}, feed);
    const stream = openStream(`${base}/api/proc/proc/feed`);
    await stream.head;
    feed.push(1);
    await stream.until((text) => text.includes('"seq":1'), "the first item");
    expect(handler.inFlight()).toBe(1);

    let drained = false;
    const drain = handler.drain(clock.now() + 1_000).then(() => (drained = true));
    await clock.advance(500);
    expect(drained).toBe(false);
    await clock.advance(500);
    await drain;
    expect(drained).toBe(true);

    handler.close();
    await stream.ended;
    expect(stream.text).toContain('"code":"ABORTED"');
    expect(handler.inFlight()).toBe(0);
  });

  it("drains at once when no request is in progress, and when the signal aborts", async () => {
    const feed = feedOf();
    const { base, handler } = await startApp({ keepAlive: false }, {}, feed);
    await handler.drain(0);
    const stream = openStream(`${base}/api/proc/proc/feed`);
    await stream.head;
    const controller = new AbortController();
    const drain = handler.drain(performance.now() + 60_000, controller.signal);
    controller.abort();
    await drain;
    stream.destroy();
  });
});

describe("procedureHandler: inside Express (CLI-3)", () => {
  it("mounts as a middleware, reads the body of express.json(), and the routes of the app stay", async () => {
    const { reg } = registry();
    const server = new ProcedureServer({ registry: reg });
    server.registerFromRegistry();
    const handler = procedureHandler(server, { basePath: "/api/proc" });
    const app = express();
    app.use(express.json({ strict: false }));
    app.use(handler.middleware);
    app.post("/api/chat", (_req, res) => {
      res.json({ chat: true });
    });
    const port = await listen(createServer(app));
    const value = await send(port, "POST", "/api/proc/proc/echo", JSON_HEADERS, '{"text":"e"}');
    expect(JSON.parse(value.body)).toEqual({ text: "e" });
    expect(JSON.parse((await send(port, "POST", "/api/chat", JSON_HEADERS, "{}")).body)).toEqual({ chat: true });
    const query = await send(port, "POST", "/api/proc/proc/meta?page=3", JSON_HEADERS, "{}");
    expect(JSON.parse(query.body).query).toEqual({ page: "3" });
  });
});
