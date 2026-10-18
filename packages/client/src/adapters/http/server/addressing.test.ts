/**
 * The addressing hook of HTTP (CLI-31): a hook of the request and its body gives the method and
 * the payload of a call. Two servers share one registry: one with a single endpoint and the path
 * in the body (`bodyPathAddressing()`), and one with the default URL addressing.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { createProcedure } from "../../../procedures/define.js";
import { createRegistry } from "../../../procedures/module.js";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { NARROWING_HEADER } from "../../../procedures/narrowing.js";
import { procedureHandler } from "./handler.js";
import { HttpServerTransport } from "./transport.js";
import { bodyPathAddressing, urlAddressing, type Addressing } from "./addressing.js";

const read = { reads: [], writes: [] };

/** One registry for both servers. */
const REGISTRY = createRegistry({
  name: "addressing",
  procedures: [
    createProcedure()
      .path(["notes", "echo"])
      .input(z.object({}).passthrough())
      .output(z.unknown())
      .meta({ effects: read })
      .handler(async (input) => input)
      .build(),
    createProcedure()
      .path(["notes", "count"])
      .input(z.object({ to: z.number() }))
      .output(z.number())
      .meta({ effects: read })
      .handler(async function* (input: { to: number }) {
        for (let n = 1; n <= input.to; n++) yield n;
      } as never)
      .build(),
    createProcedure()
      .path(["notes", "who"])
      .input(z.object({}))
      .output(z.unknown())
      .meta({ effects: read })
      .handler(async (_input, ctx) => ({ clearance: ctx.capability.clearance ?? null }))
      .build(),
    createProcedure()
      .path(["notes", "query"])
      .input(z.object({}))
      .output(z.unknown())
      .meta({ effects: read })
      .handler(async (_input, ctx) => {
        const query = ctx.metadata["query"] as Record<string, unknown>;
        return { polluted: query["polluted"] ?? null, prototype: Object.getPrototypeOf(query) === Object.prototype, own: Object.keys(query) };
      })
      .build(),
  ],
});

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

/** One listener: the body-path server at /rpc, the URL server at /api, then the application. */
async function start(bodyPath: Addressing = bodyPathAddressing()): Promise<{ port: number; appHits: string[] }> {
  const server = new ProcedureServer({ registry: REGISTRY });
  server.registerFromRegistry();
  const single = procedureHandler(server, { basePath: "/rpc", addressing: bodyPath });
  const byUrl = procedureHandler(server, { basePath: "/api" });
  const appHits: string[] = [];
  const port = await listen(
    createServer((req, res) => {
      if (single(req, res) || byUrl(req, res)) return;
      appHits.push(req.url ?? "");
      res.end("app");
    }),
  );
  return { port, appHits };
}

/** A raw request, and its response. */
function send(port: number, path: string, body?: string, headers: Record<string, string> = {}, method = "POST"): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json", ...headers } }, (res: IncomingMessage) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

describe("a body-path server and a URL server over one registry (CLI-31)", () => {
  it("gives the same value for the path in the body and for the path in the URL", async () => {
    const { port } = await start();
    const byBody = await send(port, "/rpc", JSON.stringify({ path: ["notes", "echo"], input: { text: "hi" } }));
    expect(byBody.status).toBe(200);
    expect(JSON.parse(byBody.body)).toEqual({ text: "hi" });
    const byText = await send(port, "/rpc", JSON.stringify({ path: "notes.echo", input: { text: "hi" } }));
    expect(JSON.parse(byText.body)).toEqual({ text: "hi" });
    const byUrl = await send(port, "/api/notes/echo", JSON.stringify({ text: "hi" }));
    expect(byUrl.status).toBe(200);
    expect(JSON.parse(byUrl.body)).toEqual({ text: "hi" });
  });

  it("streams with NDJSON through the single endpoint, as through the URL", async () => {
    const { port } = await start();
    const ndjson = { accept: "application/x-ndjson, application/json" };
    const lines = '{"type":"item","seq":1,"payload":1}\n{"type":"item","seq":2,"payload":2}\n{"type":"done","seq":3}\n';
    expect((await send(port, "/rpc", JSON.stringify({ path: ["notes", "count"], input: { to: 2 } }), ndjson)).body).toBe(lines);
    expect((await send(port, "/api/notes/count", JSON.stringify({ to: 2 }), ndjson)).body).toBe(lines);
  });

  it("takes the base path itself for a body path, and the URL server does not", async () => {
    const { port, appHits } = await start();
    // Without input, the payload is {}
    expect(JSON.parse((await send(port, "/rpc", JSON.stringify({ path: ["notes", "echo"] }))).body)).toEqual({});
    // A path under the base path also reads the path from the body
    expect(JSON.parse((await send(port, "/rpc/any/thing", JSON.stringify({ path: ["notes", "echo"], input: { n: 1 } }))).body)).toEqual({ n: 1 });
    expect((await send(port, "/rpcx", "{}")).body).toBe("app");
    expect((await send(port, "/api", "{}")).body).toBe("app");
    expect(appHits).toEqual(["/rpcx", "/api"]);
  });

  it("answers INVALID_REQUEST for a body without a valid path", async () => {
    const { port } = await start();
    for (const body of ["{}", '{"path": []}', '{"path": ["notes", ""]}', '{"path": 5}', "[1]", '"notes.echo"']) {
      const res = await send(port, "/rpc", body);
      expect(res.status, body).toBe(400);
      expect(JSON.parse(res.body), body).toMatchObject({ code: "INVALID_REQUEST" });
    }
    // A path of one segment cannot be a method yet (CLI-28): the error of the addressing is the message
    const one = await send(port, "/rpc", '{"path": ["morning"]}');
    expect(one.status).toBe(400);
    expect(JSON.parse(one.body)).toMatchObject({ code: "INVALID_REQUEST", error: expect.stringContaining("two segments") });
  });

  it("reads only the own fields of the body: a __proto__ key gives no path and changes no prototype", async () => {
    const { port } = await start();
    const res = await send(port, "/rpc", '{"__proto__": {"path": ["notes", "echo"], "input": {"x": 1}}}');
    expect(res.status).toBe(400);
    expect(({} as Record<string, unknown>)["path"]).toBeUndefined();
    // A path in a field of the prototype of a body from a framework does not count either
    const view = { method: "POST", path: "/rpc", url: "/rpc", headers: {}, query: {} };
    expect(bodyPathAddressing()(view, Object.create({ path: ["notes", "echo"] }), {} as IncomingMessage)).toBeNull();
  });

  it("takes other field names", async () => {
    const { port } = await start(bodyPathAddressing({ pathField: "procedure", inputField: "args" }));
    expect(JSON.parse((await send(port, "/rpc", JSON.stringify({ procedure: ["notes", "echo"], args: { a: 1 } }))).body)).toEqual({ a: 1 });
    expect((await send(port, "/rpc", JSON.stringify({ path: ["notes", "echo"] }))).status).toBe(400);
  });

  it("keeps the metadata of the request: the narrowing header applies to a body path too", async () => {
    const { port } = await start();
    const res = await send(port, "/rpc", JSON.stringify({ path: ["notes", "who"] }), { [NARROWING_HEADER]: JSON.stringify({ clearance: "guest" }) });
    expect(JSON.parse(res.body)).toEqual({ clearance: "guest" });
  });

  it("takes a hook of the application: the URL first, then the body", async () => {
    const byUrl = urlAddressing({ basePath: "/rpc" });
    const byBody = bodyPathAddressing();
    const either: Addressing = Object.assign((view: Parameters<Addressing>[0], body: unknown, req: IncomingMessage) => byUrl(view, body, req) ?? byBody(view, body, req), {
      takesBasePath: true,
    });
    const { port } = await start(either);
    expect(JSON.parse((await send(port, "/rpc/notes/echo", JSON.stringify({ via: "url" }))).body)).toEqual({ via: "url" });
    expect(JSON.parse((await send(port, "/rpc", JSON.stringify({ path: ["notes", "echo"], input: { via: "body" } }))).body)).toEqual({ via: "body" });
  });
});

describe("the addressing of the Express shim (CLI-31)", () => {
  it("routes the base path itself for a body path", async () => {
    const server = new ProcedureServer({ registry: REGISTRY });
    server.registerFromRegistry();
    const app = express();
    app.use(express.json({ strict: false }));
    const http = createServer(app);
    const transport = new HttpServerTransport(server, { app, httpServer: http, basePath: "/rpc", addressing: bodyPathAddressing() });
    await transport.start();
    const port = await listen(http);
    cleanups.push(() => transport.stop());
    const res = await send(port, "/rpc", JSON.stringify({ path: ["notes", "echo"], input: { text: "express" } }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ text: "express" });
  });

  it("keeps the URL route without the option", async () => {
    const server = new ProcedureServer({ registry: REGISTRY });
    server.registerFromRegistry();
    const app = express();
    const http = createServer(app);
    const transport = new HttpServerTransport(server, { app, httpServer: http });
    await transport.start();
    const port = await listen(http);
    cleanups.push(() => transport.stop());
    expect(JSON.parse((await send(port, "/api/notes/echo", JSON.stringify({ text: "url" }))).body)).toEqual({ text: "url" });
    expect((await send(port, "/api", "{}")).status).toBe(404);
  });
});

describe("the query in the metadata of a request", () => {
  it("copies each key of the query as an own property: a __proto__ key changes no prototype", async () => {
    const server = new ProcedureServer({ registry: REGISTRY });
    server.registerFromRegistry();
    const handler = procedureHandler(server);
    const port = await listen(
      createServer((req, res) => {
        // A framework can give a parsed query with an own __proto__ key
        Object.assign(req, { query: JSON.parse('{"__proto__": {"polluted": true}, "page": "2"}') as unknown });
        if (!handler(req, res)) res.end("app");
      }),
    );
    const res = await send(port, "/api/notes/query", "{}");
    expect(JSON.parse(res.body)).toEqual({ polluted: null, prototype: true, own: ["__proto__", "page"] });
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
