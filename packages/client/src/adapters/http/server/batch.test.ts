/**
 * The batches of calls in one HTTP request (roadmap CLI-32): the wire of `procedureHandler`, and
 * the batches of `HttpTransport` against it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { createProcedure } from "../../../procedures/define.js";
import { createRegistry } from "../../../procedures/module.js";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { pathToMethod } from "../../../server/method.js";
import type { RequestHandler, ServerRequest, ServerResponse as ProcedureResponse } from "../../../server/types.js";
import { Client } from "../../../client/client.js";
import { HttpTransport } from "../client/transport.js";
import type { HttpTransportOptions } from "../client/types.js";
import { procedureHandler, type ProcedureHandlerOptions } from "./handler.js";
import { HttpServerTransport } from "./transport.js";
import type { HttpServerTransportOptions } from "./types.js";
import { batchFrames, parseBatch, type BatchFrame } from "./batch.js";
import { defaultNdjsonError } from "./ndjson.js";

const read = { reads: [], writes: [] };

function registry() {
  return createRegistry({
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
        .path(["proc", "meta"])
        .input(z.object({}).passthrough())
        .output(z.unknown())
        .meta({ effects: read })
        .handler(async (_input, ctx) => ctx.metadata)
        .build(),
      createProcedure()
        .path(["proc", "none"])
        .input(z.object({}))
        .output(z.undefined())
        .meta({ effects: read })
        .handler(async () => undefined)
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
}

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups = [];
});

async function startApp(options: ProcedureHandlerOptions = {}): Promise<{ base: string; port: number; appHits: string[]; requests: string[] }> {
  const server = new ProcedureServer({ registry: registry() });
  server.registerFromRegistry();
  const handler = procedureHandler(server, { basePath: "/api/proc", ...options });
  const appHits: string[] = [];
  const requests: string[] = [];
  const http: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    requests.push(`${req.method} ${req.url} ${req.headers["procedures-batch"] ?? ""}`.trim());
    if (handler(req, res)) return;
    appHits.push(req.url ?? "");
    res.statusCode = 404;
    res.end("not here");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    handler.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const port = (http.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, port, appHits, requests };
}

function send(port: number, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; headers: IncomingMessage["headers"]; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const BATCH = { "content-type": "application/json", "procedures-batch": "1" };

/** The frames of an NDJSON answer of a batch, and its last line. */
function framesOf(body: string): { frames: BatchFrame[]; last: unknown } {
  const lines = body.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as { type: string; payload?: BatchFrame });
  return { frames: lines.filter((line) => line.type === "item").map((line) => line.payload!), last: lines[lines.length - 1] };
}

describe("procedureHandler: a batch of calls (CLI-32)", () => {
  it("answers one NDJSON stream whose frames name their call", async () => {
    const { port } = await startApp();
    const body = JSON.stringify({
      calls: [
        { id: "a", path: ["proc", "echo"], input: { text: "x" } },
        { id: "b", path: "proc.count", input: { to: 2 } },
        { id: "c", path: ["proc", "none"] },
      ],
    });
    const answer = await send(port, "/api/proc", BATCH, body);
    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("application/x-ndjson");
    expect(answer.headers["procedures-batch"]).toBe("1");
    const { frames, last } = framesOf(answer.body);
    expect(frames.filter((frame) => frame.call === "a")).toEqual([{ call: "a", type: "response", payload: { text: "x" } }]);
    expect(frames.filter((frame) => frame.call === "b")).toEqual([
      { call: "b", type: "item", seq: 1, payload: 1 },
      { call: "b", type: "item", seq: 2, payload: 2 },
      { call: "b", type: "done", seq: 3 },
    ]);
    // No value: the frame has no payload
    expect(frames.filter((frame) => frame.call === "c")).toEqual([{ call: "c", type: "response" }]);
    expect(last).toEqual({ type: "done", seq: 6 });
  });

  it("gives each call its own error, and the other calls run", async () => {
    const { port } = await startApp();
    const body = JSON.stringify({
      calls: [
        { id: "missing", path: ["proc", "nothing"] },
        { id: "bad", path: ["proc", "echo"], input: { text: 1 } },
        { id: "ok", path: ["proc", "echo"], input: { text: "y" } },
      ],
    });
    const { frames } = framesOf((await send(port, "/api/proc", BATCH, body)).body);
    const byCall = new Map(frames.map((frame) => [frame.call, frame]));
    expect(byCall.get("missing")).toMatchObject({ type: "error", error: { code: "NOT_FOUND", retryable: false } });
    expect(byCall.get("bad")).toMatchObject({ type: "error", error: { code: "VALIDATION_ERROR" } });
    expect(byCall.get("ok")).toEqual({ call: "ok", type: "response", payload: { text: "y" } });
  });

  it("refuses a bad batch with INVALID_REQUEST, and a batch above maxCalls with PAYLOAD_TOO_LARGE; no call runs", async () => {
    const { port } = await startApp({ batch: { maxCalls: 2 } });
    const call = (id: string) => ({ id, path: ["proc", "echo"], input: { text: id } });
    for (const body of [{}, { calls: [] }, { calls: [call("a"), call("a")] }, { calls: [{ id: "", path: ["proc", "echo"] }] }, { calls: [{ id: "a", path: [] }] }, { calls: [{ id: "a", path: "proc.echo", headers: { x: 1 } }] }]) {
      const answer = await send(port, "/api/proc", BATCH, JSON.stringify(body));
      expect(answer.status).toBe(400);
      expect(JSON.parse(answer.body)).toMatchObject({ code: "INVALID_REQUEST" });
      // A server that takes batches says so on each answer to a batch, also on an error
      expect(answer.headers["procedures-batch"]).toBe("1");
    }
    const tooMany = await send(port, "/api/proc", BATCH, JSON.stringify({ calls: [call("a"), call("b"), call("c")] }));
    expect(tooMany.status).toBe(413);
    expect(JSON.parse(tooMany.body)).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("with batch: false, a batch request goes on to the application", async () => {
    const { port, appHits } = await startApp({ batch: false });
    const answer = await send(port, "/api/proc", BATCH, JSON.stringify({ calls: [{ id: "a", path: "proc.echo", input: { text: "x" } }] }));
    expect(answer.status).toBe(404);
    expect(appHits).toEqual(["/api/proc"]);
  });

  it("gives each call the headers and the metadata of the call; the secret headers stay those of the request", async () => {
    const { port } = await startApp();
    const body = JSON.stringify({
      calls: [
        { id: "a", path: "proc.meta", headers: { "x-tenant": "t1", authorization: "Bearer other", "content-type": "text/plain" }, metadata: { trace: "a", __local: true } },
        { id: "b", path: "proc.meta", metadata: { trace: "b" } },
      ],
    });
    const { frames } = framesOf((await send(port, "/api/proc", { ...BATCH, "x-tenant": "outer", authorization: "Bearer token" }, body)).body);
    const metadataOf = (call: string) => (frames.find((frame) => frame.call === call) as { payload: Record<string, unknown> }).payload;
    const a = metadataOf("a");
    expect(a).toMatchObject({ trace: "a", "x-tenant": "t1" });
    expect(a).not.toHaveProperty("__local");
    const headers = a["headers"] as Record<string, unknown>;
    expect(headers["x-tenant"]).toBe("t1");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers).not.toHaveProperty("authorization");
    expect(metadataOf("b")).toMatchObject({ trace: "b", "x-tenant": "outer" });
  });
});

describe("batchFrames (CLI-32)", () => {
  it("runs at most `concurrency` calls at the same time, and gives each call its frames", async () => {
    let running = 0;
    let most = 0;
    const server: RequestHandler = {
      async handle(request: ServerRequest): Promise<ProcedureResponse> {
        running++;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return { id: request.id, status: { type: "success", code: 200 }, payload: request.payload, metadata: {} };
      },
    };
    const calls = parseBatch({ calls: Array.from({ length: 7 }, (_, n) => ({ id: `c${n}`, path: "proc.echo", input: n })) }, 64);
    const runs = calls.map((call) => ({ call: call.id, request: { id: call.id, method: call.method, payload: call.input, metadata: {} } }));
    const frames: BatchFrame[] = [];
    for await (const frame of batchFrames(server, runs, 3, defaultNdjsonError)) frames.push(frame);
    expect(most).toBe(3);
    expect(frames.map((frame) => frame.call).sort()).toEqual(calls.map((call) => call.id).sort());
    expect(frames.every((frame) => frame.type === "response")).toBe(true);
  });

  it("gives an error frame for a handle() that throws", async () => {
    const server: RequestHandler = {
      handle: () => Promise.reject(new Error("broken")),
    };
    const frames: BatchFrame[] = [];
    for await (const frame of batchFrames(server, [{ call: "x", request: { id: "x", method: pathToMethod(["a"]), payload: {}, metadata: {} } }], 2, defaultNdjsonError)) frames.push(frame);
    expect(frames).toEqual([{ call: "x", type: "error", error: { code: "INTERNAL_ERROR", message: "broken", retryable: false } }]);
  });
});

describe("HttpTransport: batches (CLI-32)", () => {
  function clientOf(base: string, options: Partial<HttpTransportOptions> = {}): Client {
    return new Client(new HttpTransport({ baseUrl: `${base}/api/proc`, batch: true, ...options }));
  }

  it("sends the calls of one turn in one request, and each call gets its own result", async () => {
    const { base, requests } = await startApp();
    const client = clientOf(base);
    const items: unknown[] = [];
    const [echo, none] = await Promise.all([
      client.call(pathToMethod(["proc", "echo"]), { text: "x" }),
      client.call(pathToMethod(["proc", "none"]), {}),
      (async () => {
        for await (const item of client.stream(pathToMethod(["proc", "count"]), { to: 3 })) items.push(item);
      })(),
    ]);
    expect(echo).toEqual({ text: "x" });
    expect(none).toBeUndefined();
    expect(items).toEqual([1, 2, 3]);
    expect(requests).toEqual(["POST /api/proc 1"]);
  });

  it("gives the error of one call to that call only", async () => {
    const { base } = await startApp();
    const client = clientOf(base);
    const [missing, ok] = await Promise.allSettled([client.call(pathToMethod(["proc", "nothing"]), {}), client.call(pathToMethod(["proc", "echo"]), { text: "y" })]);
    expect(missing.status).toBe("rejected");
    expect((missing as PromiseRejectedResult).reason).toMatchObject({ code: "NOT_FOUND" });
    expect(ok).toEqual({ status: "fulfilled", value: { text: "y" } });
  });

  it("sends a call alone when it is the only call of its turn", async () => {
    const { base, requests } = await startApp();
    expect(await clientOf(base).call(pathToMethod(["proc", "echo"]), { text: "x" })).toEqual({ text: "x" });
    expect(requests).toEqual(["POST /api/proc/proc/echo"]);
  });

  it("puts calls with other secret headers in other requests", async () => {
    const { base, requests } = await startApp();
    const client = clientOf(base);
    await Promise.all([
      client.call(pathToMethod(["proc", "echo"]), { text: "a" }, { metadata: { auth: { token: "one" } } }),
      client.call(pathToMethod(["proc", "echo"]), { text: "b" }, { metadata: { auth: { token: "one" } } }),
      client.call(pathToMethod(["proc", "echo"]), { text: "c" }, { metadata: { auth: { token: "two" } } }),
    ]);
    expect(requests.sort()).toEqual(["POST /api/proc 1", "POST /api/proc/proc/echo"]);
  });

  it("sends each call alone to a server without batches, now and later", async () => {
    const { base, requests } = await startApp({ batch: false });
    const client = clientOf(base);
    const call = (text: string) => client.call(pathToMethod(["proc", "echo"]), { text });
    expect(await Promise.all([call("a"), call("b")])).toEqual([{ text: "a" }, { text: "b" }]);
    expect(await Promise.all([call("c"), call("d")])).toEqual([{ text: "c" }, { text: "d" }]);
    expect(requests).toEqual(["POST /api/proc 1", "POST /api/proc/proc/echo", "POST /api/proc/proc/echo", "POST /api/proc/proc/echo", "POST /api/proc/proc/echo"]);
  });

  it("aborts one call of a batch, and the other call ends as usual", async () => {
    const { base } = await startApp();
    const client = clientOf(base);
    const controller = new AbortController();
    const slow = client.call(pathToMethod(["proc", "slow"]), {}, { signal: controller.signal });
    const echo = client.call(pathToMethod(["proc", "echo"]), { text: "z" });
    setTimeout(() => controller.abort(), 20);
    await expect(slow).rejects.toMatchObject({ code: "ABORTED" });
    expect(await echo).toEqual({ text: "z" });
  });
});

describe("the Express shim: a batch of calls (CLI-32)", () => {
  async function startExpress(options: HttpServerTransportOptions, json: boolean): Promise<number> {
    const server = new ProcedureServer({ registry: registry() });
    server.registerFromRegistry();
    const app = express();
    if (json) app.use(express.json({ strict: false }));
    const http = createServer(app);
    const transport = new HttpServerTransport(server, { app, httpServer: http, ...options });
    await transport.start();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(async () => {
      await transport.stop();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    });
    return (http.address() as AddressInfo).port;
  }

  const body = JSON.stringify({ calls: [{ id: "a", path: "proc.echo", input: { text: "e" } }, { id: "b", path: "proc.count", input: { to: 1 } }] });

  for (const json of [false, true]) {
    it(`takes a batch at the base path ${json ? "after express.json()" : "with no body parser"}`, async () => {
      const port = await startExpress({}, json);
      const answer = await send(port, "/api", BATCH, body);
      expect(answer.status).toBe(200);
      expect(answer.headers["procedures-batch"]).toBe("1");
      const { frames, last } = framesOf(answer.body);
      expect(frames).toContainEqual({ call: "a", type: "response", payload: { text: "e" } });
      expect(frames.filter((frame) => frame.call === "b")).toEqual([
        { call: "b", type: "item", seq: 1, payload: 1 },
        { call: "b", type: "done", seq: 2 },
      ]);
      expect(last).toEqual({ type: "done", seq: 4 });
    });
  }

  it("gives no batch with batch: false", async () => {
    const port = await startExpress({ batch: false }, true);
    const answer = await send(port, "/api", BATCH, body);
    expect(answer.headers["procedures-batch"]).toBeUndefined();
    expect(answer.status).not.toBe(200);
  });
});
