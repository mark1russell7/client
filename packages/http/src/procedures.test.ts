/**
 * The HTTP procedures against a local server (roadmap R38).
 *
 * The default module refuses loopback addresses, so the tests use a module whose allowlist names
 * 127.0.0.1. A fake resolver gives names for the redirects and the DNS cases. The tests cover the
 * redirects to refused hosts, the size limits, the time limits, the abort, and the streams that
 * the reader stops early.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import {
  InvocationError,
  ProcedureServer,
  createRegistry,
  hostPolicy,
  invokePath,
  outputValue,
  procedureServerOptions,
  type ProcedureRegistry,
} from "@procedures/client";
import { createHttpModule, httpModule, registerHttpProcedures } from "./module.js";
import { HOST_NOT_ALLOWED, isHostNotAllowed, type ResolvedAddress } from "./policy.js";
import { HttpError } from "./errors.js";
import type { HttpJsonOutput, HttpRequestOutput, HttpSseOutput } from "./types.js";

// =============================================================================
// The server
// =============================================================================

let server: Server;
let base: string;
let port: number;
/** The requests that closed, by path: a stream that the reader stopped closes its request. */
const closed = new Map<string, () => void>();
const closedPromise = (path: string): Promise<void> => new Promise((resolve) => closed.set(path, resolve));
/** The last request of each path. */
const seen = new Map<string, { method: string; headers: IncomingMessage["headers"]; body: string }>();

function routes(req: IncomingMessage, res: ServerResponse, body: string): void {
  const url = new URL(req.url ?? "/", "http://x");
  const json = (status: number, value: unknown): void => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  switch (url.pathname) {
    case "/text":
      res.writeHead(200, { "content-type": "text/plain", "set-cookie": ["a=1", "b=2"] });
      res.end("hello");
      return;
    case "/json":
      json(200, { a: 1, query: Object.fromEntries(url.searchParams) });
      return;
    case "/echo":
      json(200, { method: req.method, headers: req.headers, body, query: [...url.searchParams] });
      return;
    case "/empty":
      res.writeHead(204);
      res.end();
      return;
    case "/missing":
      res.writeHead(404, "Not Found", { "content-type": "text/plain" });
      res.end("no such thing");
      return;
    case "/not-json":
      res.writeHead(200, { "content-type": "application/json" });
      res.end("<html>");
      return;
    case "/bytes":
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from([0, 1, 2, 255]));
      return;
    case "/big":
      res.writeHead(200, { "content-type": "text/plain", "content-length": String(20_000) });
      res.end("x".repeat(20_000));
      return;
    case "/big-chunked":
      res.writeHead(200, { "content-type": "text/plain" });
      for (let i = 0; i < 20; i++) res.write("y".repeat(1000));
      res.end();
      return;
    case "/gzip":
      res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
      res.end(gzipSync(JSON.stringify({ zipped: true })));
      return;
    case "/gzip-bomb":
      // 2 MB of zeros in a few kB
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.end(gzipSync(Buffer.alloc(2_000_000)));
      return;
    case "/redirect/same":
      res.writeHead(302, { location: "/json?from=redirect" });
      res.end();
      return;
    case "/redirect/private":
      res.writeHead(302, { location: "http://10.0.0.1/admin" });
      res.end();
      return;
    case "/redirect/metadata":
      res.writeHead(301, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
      return;
    case "/redirect/loopback-name":
      res.writeHead(302, { location: `http://rebind.test:${port}/json` });
      res.end();
      return;
    case "/redirect/other-origin":
      res.writeHead(307, { location: `http://other.test:${port}/echo` });
      res.end();
      return;
    case "/redirect/loop":
      res.writeHead(302, { location: "/redirect/loop" });
      res.end();
      return;
    case "/redirect/303":
      res.writeHead(303, { location: "/echo" });
      res.end();
      return;
    case "/redirect/307":
      res.writeHead(307, { location: "/echo" });
      res.end();
      return;
    case "/redirect/ftp":
      res.writeHead(302, { location: "ftp://127.0.0.1/file" });
      res.end();
      return;
    case "/hang":
      // No answer: the request waits until the client stops it
      return;
    case "/hold":
      // No answer, as /hang. A test aborts after `seen` has the request, so the client waits for the answer then
      return;
    case "/gzip-reset": {
      // Half of a gzip body, then a reset: the decoder of the client gets an error in the middle
      const zipped = gzipSync("x".repeat(64 * 1024));
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.write(zipped.subarray(0, Math.floor(zipped.length / 2)), () => res.socket?.destroy());
      return;
    }
    case "/ndjson":
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.end('{"n":1}\n\n{"n":2}\r\n[3]\n"four"');
      return;
    case "/ndjson/bad":
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.end('{"n":1}\nnot json\n');
      return;
    case "/ndjson/gzip":
      res.writeHead(200, { "content-type": "application/x-ndjson", "content-encoding": "gzip" });
      res.end(gzipSync('{"n":1}\n{"n":2}\n'));
      return;
    case "/ndjson/endless":
    case "/sse/endless": {
      const sse = url.pathname.startsWith("/sse");
      res.writeHead(200, { "content-type": sse ? "text/event-stream" : "application/x-ndjson" });
      let n = 0;
      const timer = setInterval(() => res.write(sse ? `id: ${++n}\ndata: {"n":${n}}\n\n` : `{"n":${++n}}\n`), 10);
      res.on("close", () => clearInterval(timer));
      return;
    }
    case "/ndjson/idle":
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.write('{"n":1}\n');
      return;
    case "/ndjson/keep-alive": {
      // A quiet stream of 200 ms between two items, with a keep-alive line every 20 ms
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.write('{"n":1}\n');
      let lines = 0;
      const timer = setInterval(() => {
        if (++lines <= 10) {
          res.write("\n");
          return;
        }
        clearInterval(timer);
        res.end('{"n":2}\n');
      }, 20);
      res.on("close", () => clearInterval(timer));
      return;
    }
    case "/sse":
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      res.end(`: hello\n\nevent: start\ndata: ${req.headers["last-event-id"] ?? "none"}\n\nid: 42\ndata: line 1\ndata: line 2\n\n`);
      return;
    case "/sse/chat": {
      // An LLM API: the answer to a POST as server-sent events, one event for each word
      if (req.method !== "POST") {
        res.writeHead(405, { "content-type": "text/plain" });
        res.end("POST only");
        return;
      }
      const { prompt } = JSON.parse(body) as { prompt: string };
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const word of prompt.split(" ")) res.write(`event: delta\ndata: ${JSON.stringify({ text: word })}\n\n`);
      res.end("event: done\ndata: [DONE]\n\n");
      return;
    }
    case "/ndjson/echo":
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.end(`${JSON.stringify({ method: req.method, type: req.headers["content-type"] ?? null, body })}\n`);
      return;
    case "/sse/wrong-type":
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("data: x\n\n");
      return;
    default:
      res.writeHead(500);
      res.end(`no route ${url.pathname}`);
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    res.on("close", () => closed.get(path)?.());
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      seen.set(path, { method: req.method ?? "", headers: req.headers, body });
      routes(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// =============================================================================
// The registry
// =============================================================================

/** The answers of the fake DNS. */
let lookups: string[] = [];
const resolve = async (name: string): Promise<ResolvedAddress[]> => {
  lookups.push(name);
  switch (name) {
    case "other.test":
    case "rebind.test":
      return [{ address: "127.0.0.1", family: 4 }];
    case "slow.test":
      // A DNS that does not answer
      return new Promise<ResolvedAddress[]>(() => undefined);
    case "mixed.test":
      // A refused address first: the connection must use only the allowed one
      return [
        { address: "10.0.0.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ];
    default:
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${name}`), { code: "ENOTFOUND" });
  }
};

let registry: ProcedureRegistry;

beforeEach(() => {
  lookups = [];
  registry = createRegistry(createHttpModule({ allow: ["127.0.0.1"], resolve }));
});

async function call<T>(key: string, input: unknown, options: { at?: ProcedureRegistry; signal?: AbortSignal; deadline?: number } = {}): Promise<T> {
  const path = key.split(".");
  const output = await invokePath<T>(path, input, {
    registry: options.at ?? registry,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.deadline !== undefined ? { capability: { deadline: options.deadline } } : {}),
  });
  return outputValue(output, path);
}

async function stream<T>(key: string, input: unknown, options: { at?: ProcedureRegistry; signal?: AbortSignal; deadline?: number } = {}): Promise<AsyncGenerator<T, void, undefined>> {
  const output = await invokePath<T>(key.split("."), input, {
    registry: options.at ?? registry,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.deadline !== undefined ? { capability: { deadline: options.deadline } } : {}),
  });
  if (output.kind !== "stream") throw new Error(`${key} gave a value, not a stream`);
  return output.items;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  return error as Error;
}

async function refusal(promise: Promise<unknown>): Promise<InvocationError> {
  const error = await failure(promise);
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: HOST_NOT_ALLOWED });
  expect(isHostNotAllowed(error)).toBe(true);
  return error as InvocationError;
}

// =============================================================================
// Tests
// =============================================================================

describe("the module", () => {
  it("declares the effects and the unbounded streams", () => {
    const meta = (key: string) => registry.get(key.split("."))!.metadata as Record<string, unknown>;
    expect(meta("http.request")["effects"]).toEqual({ reads: ["network"], writes: ["network"] });
    expect(meta("http.json")["effects"]).toEqual({ reads: ["network"], writes: ["network"] });
    // The streams send a POST too, and a POST can change remote data
    expect(meta("http.ndjson")["effects"]).toEqual({ reads: ["network"], writes: ["network"] });
    expect(meta("http.sse")["effects"]).toEqual({ reads: ["network"], writes: ["network"] });
    expect(meta("http.ndjson")["stream"]).toEqual({ unbounded: true });
    expect(meta("http.sse")["stream"]).toEqual({ unbounded: true });
    expect(meta("http.request")["stream"]).toBeUndefined();
  });

  it("gives httpModule without options, and refuses a bad allow entry", () => {
    expect(createHttpModule()).toBe(httpModule);
    expect(createHttpModule({})).toBe(httpModule);
    expect(() => createHttpModule({ allow: ["not a host"] })).toThrow(/allow entry/);
    const global = createRegistry();
    registerHttpProcedures(global, { allow: ["127.0.0.1"] });
    expect(global.get(["http", "sse"])).toBeDefined();
  });
});

describe("http.request", () => {
  it("gives the status, the headers and the body as text", async () => {
    const result = await call<HttpRequestOutput>("http.request", { url: `${base}/text` });
    expect(result).toMatchObject({ status: 200, statusText: "OK", ok: true, url: `${base}/text`, redirected: false, body: "hello", bytes: 5 });
    expect(result.headers["content-type"]).toBe("text/plain");
    expect(result.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
  });

  it("sends the method, the headers, the query and a body of text, JSON or bytes", async () => {
    const text = await call<HttpRequestOutput>("http.request", {
      url: `${base}/echo?x=1`,
      method: "PUT",
      headers: { "X-Custom": "yes" },
      query: { y: 2, z: [true, "w"] },
      body: "plain",
      responseType: "json",
    });
    expect(text.body).toMatchObject({ method: "PUT", body: "plain", query: [["x", "1"], ["y", "2"], ["z", "true"], ["z", "w"]] });
    expect((text.body as { headers: Record<string, string> }).headers).toMatchObject({
      "x-custom": "yes",
      "content-type": "text/plain; charset=utf-8",
      "user-agent": "@procedures/http",
    });
    const json = await call<HttpRequestOutput>("http.request", { url: `${base}/echo`, method: "POST", json: { a: [1] }, responseType: "json" });
    expect(json.body).toMatchObject({ body: '{"a":[1]}', headers: { "content-type": "application/json" } });
    const bytes = await call<HttpRequestOutput>("http.request", { url: `${base}/echo`, method: "POST", bodyBase64: Buffer.from("hi").toString("base64"), responseType: "json" });
    expect(bytes.body).toMatchObject({ body: "hi", headers: { "content-type": "application/octet-stream" } });
  });

  it("gives bytes in base64, null for an empty JSON body, and each status", async () => {
    expect((await call<HttpRequestOutput>("http.request", { url: `${base}/bytes`, responseType: "bytes" })).body).toBe("AAEC/w==");
    expect((await call<HttpRequestOutput>("http.request", { url: `${base}/empty`, responseType: "json" })).body).toBeNull();
    expect(await call<HttpRequestOutput>("http.request", { url: `${base}/missing` })).toMatchObject({ status: 404, ok: false, body: "no such thing" });
    expect(await call<HttpRequestOutput>("http.request", { url: `${base}/text`, method: "HEAD" })).toMatchObject({ status: 200, body: "", bytes: 0 });
  });

  it("decodes a gzip body", async () => {
    expect((await call<HttpRequestOutput>("http.request", { url: `${base}/gzip`, responseType: "json" })).body).toEqual({ zipped: true });
  });

  it("refuses a bad input: two bodies, a body of a GET, another protocol, bad JSON", async () => {
    expect((await failure(call("http.request", { url: `${base}/echo`, method: "POST", body: "a", json: 1 }))).message).toMatch(/only one of body, json and bodyBase64/);
    expect((await failure(call("http.request", { url: `${base}/echo`, body: "a" }))).message).toMatch(/a GET request has no body/);
    expect(await failure(call("http.request", { url: "ftp://127.0.0.1/" }))).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await failure(call("http.request", { url: `${base}/not-json`, responseType: "json" }))).toMatchObject({ code: "BAD_JSON" });
  });
});

describe("the hosts", () => {
  it("refuses loopback in the default module, also on the faces of a host", async () => {
    const plain = createRegistry(httpModule);
    const error = await refusal(call("http.request", { url: `${base}/text` }, { at: plain }));
    expect(error.message).toContain("127.0.0.1 is a loopback address");
    await refusal(call("http.json", { url: "http://[::1]/" }, { at: plain }));
    await refusal(stream("http.ndjson", { url: "http://192.168.0.1/feed" }, { at: plain }));
    await refusal(stream("http.sse", { url: "http://169.254.169.254/" }, { at: plain }));

    const host = new ProcedureServer(procedureServerOptions(hostPolicy({}), plain));
    const response = await host.handle({ id: "1", method: { service: "http", operation: "request" }, payload: { url: `${base}/text` }, metadata: {} });
    expect(response.status).toMatchObject({ type: "error", code: "FORBIDDEN", retryable: false });
    expect(response.metadata).toEqual({ reason: HOST_NOT_ALLOWED });
  });

  it("follows a redirect to an allowed host", async () => {
    const result = await call<HttpRequestOutput>("http.request", { url: `${base}/redirect/same`, responseType: "json" });
    expect(result).toMatchObject({ status: 200, redirected: true, url: `${base}/json?from=redirect`, body: { a: 1, query: { from: "redirect" } } });
  });

  it("refuses a redirect to a private or a link-local host, before a connection", async () => {
    const error = await refusal(call("http.request", { url: `${base}/redirect/private` }));
    expect(error.message).toContain("the redirect to http://10.0.0.1/admin");
    await refusal(call("http.json", { url: `${base}/redirect/metadata` }));
  });

  it("refuses a redirect to a name that resolves to loopback, unless a range of allow has the address", async () => {
    const defaults = createRegistry(createHttpModule({ resolve }));
    const error = await refusal(call("http.request", { url: `http://rebind.test:${port}/json` }, { at: defaults }));
    expect(error.message).toContain("the host rebind.test of the URL is not allowed: 127.0.0.1 is a loopback address");
    // The range 127.0.0.1 of allow has the address of the name
    const result = await call<HttpRequestOutput>("http.request", { url: `${base}/redirect/loopback-name` });
    expect(result).toMatchObject({ status: 200, url: `http://rebind.test:${port}/json` });
  });

  it("obeys the port of an allow entry and publicHosts: false", async () => {
    const strict = createRegistry(createHttpModule({ allow: [`127.0.0.1:${port}`, "*.example.test"], publicHosts: false, resolve }));
    expect((await call<HttpRequestOutput>("http.request", { url: `${base}/text` }, { at: strict })).status).toBe(200);
    await refusal(call("http.request", { url: "http://8.8.8.8/" }, { at: strict }));
    await refusal(call("http.request", { url: `http://127.0.0.1:${port + 1}/` }, { at: strict }));
    const otherPort = createRegistry(createHttpModule({ allow: ["127.0.0.1:1"], resolve }));
    await refusal(call("http.request", { url: `${base}/text` }, { at: otherPort }));
  });

  it("connects only to the addresses that the check allowed (DNS rebinding)", async () => {
    const result = await call<HttpRequestOutput>("http.request", { url: `http://mixed.test:${port}/echo`, responseType: "json" });
    expect(result.status).toBe(200);
    expect((result.body as { headers: Record<string, string> }).headers["host"]).toBe(`mixed.test:${port}`);
    // One look-up for one request: the socket does not ask the DNS again
    expect(lookups).toEqual(["mixed.test"]);
  });

  it("removes the credentials at a redirect to another origin, and keeps the method of a 307", async () => {
    const result = await call<HttpRequestOutput>("http.request", {
      url: `${base}/redirect/other-origin`,
      method: "POST",
      headers: { Authorization: "Bearer secret", Cookie: "a=1", "X-Keep": "1" },
      body: "payload",
      responseType: "json",
    });
    const echo = result.body as { method: string; body: string; headers: Record<string, string> };
    expect(result.url).toBe(`http://other.test:${port}/echo`);
    expect(echo).toMatchObject({ method: "POST", body: "payload" });
    expect(echo.headers["authorization"]).toBeUndefined();
    expect(echo.headers["cookie"]).toBeUndefined();
    expect(echo.headers["x-keep"]).toBe("1");
  });

  it("continues a 303 with a GET without the body, and a 307 with the method and the body", async () => {
    const after303 = await call<HttpRequestOutput>("http.request", { url: `${base}/redirect/303`, method: "POST", body: "x", responseType: "json" });
    expect(after303.body).toMatchObject({ method: "GET", body: "" });
    expect((after303.body as { headers: Record<string, string> }).headers["content-type"]).toBeUndefined();
    const after307 = await call<HttpRequestOutput>("http.request", { url: `${base}/redirect/307`, method: "PATCH", body: "y", responseType: "json" });
    expect(after307.body).toMatchObject({ method: "PATCH", body: "y" });
  });

  it("obeys redirect: manual and error, maxRedirects, and refuses another protocol", async () => {
    expect(await call<HttpRequestOutput>("http.request", { url: `${base}/redirect/private`, redirect: "manual" })).toMatchObject({
      status: 302,
      redirected: false,
      headers: { location: "http://10.0.0.1/admin" },
    });
    expect(await failure(call("http.request", { url: `${base}/redirect/same`, redirect: "error" }))).toMatchObject({ code: "REDIRECT", status: 302 });
    expect(await failure(call("http.request", { url: `${base}/redirect/loop` }))).toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    expect(await failure(call("http.request", { url: `${base}/redirect/same`, maxRedirects: 0 }))).toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    expect(await failure(call("http.request", { url: `${base}/redirect/ftp` }))).toMatchObject({ code: "BAD_URL" });
  });

  it("fails with CONNECTION for a port without a server", async () => {
    const closedPort = createServer();
    await new Promise<void>((done) => closedPort.listen(0, "127.0.0.1", done));
    const free = (closedPort.address() as AddressInfo).port;
    await new Promise<void>((done) => closedPort.close(() => done()));
    expect(await failure(call("http.request", { url: `http://127.0.0.1:${free}/` }))).toMatchObject({ code: "CONNECTION" });
  });
});

describe("the size limits", () => {
  it("refuses a response larger than maxResponseBytes, with or without its length", async () => {
    expect((await call<HttpRequestOutput>("http.request", { url: `${base}/big` })).bytes).toBe(20_000);
    expect(await failure(call("http.request", { url: `${base}/big`, maxResponseBytes: 19_999 }))).toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    expect(await failure(call("http.request", { url: `${base}/big-chunked`, maxResponseBytes: 5000 }))).toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    expect(await failure(call("http.json", { url: `${base}/big`, maxResponseBytes: 100 }))).toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("counts the decoded bytes of a compressed body", async () => {
    expect(await failure(call("http.request", { url: `${base}/gzip-bomb`, maxResponseBytes: 1_000_000 }))).toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("takes the smaller of the limit of the input and the limit of the module", async () => {
    const small = createRegistry(createHttpModule({ allow: ["127.0.0.1"], maxResponseBytes: 1000, maxRequestBytes: 10 }));
    expect(await failure(call("http.request", { url: `${base}/big`, maxResponseBytes: 1_000_000 }, { at: small }))).toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    expect(await failure(call("http.request", { url: `${base}/echo`, method: "POST", body: "12345678901" }, { at: small }))).toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect((await call<HttpRequestOutput>("http.request", { url: `${base}/echo`, method: "POST", body: "1234567890" }, { at: small })).status).toBe(200);
  });
});

describe("the time limits and the abort", () => {
  it("stops at timeoutMs with TIMEOUT", async () => {
    const started = Date.now();
    const error = await failure(call("http.request", { url: `${base}/hang`, timeoutMs: 100 }));
    expect(error).toMatchObject({ code: "TIMEOUT" });
    expect(error.message).toContain("more than 100 ms (timeoutMs)");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("stops at the deadline of the call when it comes before timeoutMs", async () => {
    const error = await failure(call("http.json", { url: `${base}/hang`, timeoutMs: 60_000 }, { deadline: Date.now() + 100 }));
    expect(error).toMatchObject({ code: "TIMEOUT" });
  });

  it("stops at an abort of the caller with ABORTED", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const error = await failure(call("http.request", { url: `${base}/hang`, timeoutMs: 60_000 }, { signal: controller.signal }));
    expect(error).toMatchObject({ code: "ABORTED" });
  });

  it("stops with ABORTED at an abort that comes while the request waits for its answer", async () => {
    // The abort comes after the server has the request, thus always while the client waits. The test
    // above aborts after 50 ms, and on a slow computer that abort can come before the request goes out.
    seen.delete("/hold");
    const controller = new AbortController();
    const pending = failure(call("http.request", { url: `${base}/hold`, timeoutMs: 60_000 }, { signal: controller.signal }));
    for (let tries = 0; !seen.has("/hold"); tries++) {
      if (tries > 500) throw new Error("the server did not get the request");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort();
    expect(await pending).toMatchObject({ code: "ABORTED" });
  });

  it("fails when a gzip body ends in the middle with a reset", async () => {
    await expect(call("http.request", { url: `${base}/gzip-reset`, timeoutMs: 10_000 })).rejects.toThrow();
  });

  it("stops at timeoutMs while the DNS does not answer", async () => {
    expect(await failure(call("http.request", { url: "http://slow.test/", timeoutMs: 100 }))).toMatchObject({ code: "TIMEOUT" });
  });

  it("gives the stop to the reader of a stream that read nothing yet", async () => {
    const closing = closedPromise("/ndjson/endless");
    const items = await stream("http.ndjson", { url: `${base}/ndjson/endless`, timeoutMs: 100 });
    await new Promise((done) => setTimeout(done, 300));
    // The connection closed at the stop, and the error waits for the reader
    await closing;
    const error = await failure(collect(items));
    expect(error).toMatchObject({ code: "TIMEOUT" });
  });

  it("stops a stream that gets no data for idleTimeoutMs, after the first item", async () => {
    const items = await stream<unknown>("http.ndjson", { url: `${base}/ndjson/idle`, idleTimeoutMs: 150 });
    expect((await items.next()).value).toEqual({ n: 1 });
    expect(await failure(items.next())).toMatchObject({ code: "TIMEOUT", message: expect.stringContaining("idleTimeoutMs") });
  });

  it("takes a keep-alive line as data: a quiet stream with keep-alive lines does not reach idleTimeoutMs", async () => {
    const items = await stream<unknown>("http.ndjson", { url: `${base}/ndjson/keep-alive`, idleTimeoutMs: 150 });
    expect(await collect(items)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("does not count the time that the reader holds an item as idle time", async () => {
    const items = await stream<unknown>("http.ndjson", { url: `${base}/ndjson`, idleTimeoutMs: 100 });
    await new Promise((done) => setTimeout(done, 250));
    expect(await collect(items)).toEqual([{ n: 1 }, { n: 2 }, [3], "four"]);
  });
});

describe("http.json", () => {
  it("sends a GET or a POST and gives the parsed body", async () => {
    expect(await call<HttpJsonOutput>("http.json", { url: `${base}/json`, query: { q: "a b" } })).toMatchObject({ status: 200, ok: true, data: { a: 1, query: { q: "a b" } } });
    const posted = await call<HttpJsonOutput>("http.json", { url: `${base}/echo`, json: { hello: "world" } });
    expect(posted.data).toMatchObject({ method: "POST", body: '{"hello":"world"}', headers: { accept: "application/json", "content-type": "application/json" } });
    expect((await call<HttpJsonOutput>("http.json", { url: `${base}/empty` })).data).toBeNull();
    expect((await call<HttpJsonOutput>("http.json", { url: `${base}/gzip` })).data).toEqual({ zipped: true });
  });

  it("fails for a status outside 200 to 299, unless failOnStatus is false", async () => {
    const error = await failure(call("http.json", { url: `${base}/missing` }));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ code: "HTTP_STATUS", status: 404 });
    expect(error.message).toBe("http.json: the server answered 404 Not Found: no such thing");
    // The error page is not JSON: the output keeps its text
    expect(await call<HttpJsonOutput>("http.json", { url: `${base}/missing`, failOnStatus: false })).toMatchObject({ status: 404, ok: false, data: "no such thing" });
  });

  it("refuses a body that is not JSON, and a GET with a body", async () => {
    expect(await failure(call("http.json", { url: `${base}/not-json` }))).toMatchObject({ code: "BAD_JSON" });
    expect((await failure(call("http.json", { url: `${base}/echo`, method: "GET", json: 1 }))).message).toMatch(/a GET request has no body/);
  });
});

describe("http.ndjson", () => {
  it("gives the JSON value of each line that is not blank", async () => {
    expect(await collect(await stream("http.ndjson", { url: `${base}/ndjson` }))).toEqual([{ n: 1 }, { n: 2 }, [3], "four"]);
    expect(await collect(await stream("http.ndjson", { url: `${base}/ndjson/gzip` }))).toEqual([{ n: 1 }, { n: 2 }]);
    expect(seen.get("/ndjson")?.headers["accept"]).toContain("application/x-ndjson");
  });

  it("fails at a line that is not JSON, after the lines before it", async () => {
    const items = await stream("http.ndjson", { url: `${base}/ndjson/bad` });
    expect((await items.next()).value).toEqual({ n: 1 });
    const error = await failure(items.next());
    expect(error).toMatchObject({ code: "BAD_JSON" });
    expect(error.message).toContain("line 2 is not JSON");
  });

  it("fails the call itself for a status outside 200 to 299", async () => {
    const error = await failure(stream("http.ndjson", { url: `${base}/missing` }));
    expect(error).toMatchObject({ code: "HTTP_STATUS", status: 404 });
    expect(error.message).toContain("no such thing");
  });

  it("closes the connection when the reader stops early", async () => {
    const closing = closedPromise("/ndjson/endless");
    const items: unknown[] = [];
    for await (const item of await stream("http.ndjson", { url: `${base}/ndjson/endless` })) {
      items.push(item);
      if (items.length === 3) break;
    }
    expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    await closing;
  });

  it("closes the connection at an abort of the caller", async () => {
    const closing = closedPromise("/ndjson/endless");
    const controller = new AbortController();
    const items = await stream("http.ndjson", { url: `${base}/ndjson/endless` }, { signal: controller.signal });
    await items.next();
    controller.abort();
    const error = await failure(collect(items));
    expect(error).toMatchObject({ code: "ABORTED" });
    await closing;
  });
});

describe("http.sse", () => {
  it("gives each event with its type, its data and the last event ID", async () => {
    expect(await collect(await stream<HttpSseOutput>("http.sse", { url: `${base}/sse` }))).toEqual([
      { event: "start", data: "none" },
      { event: "message", data: "line 1\nline 2", id: "42" },
    ]);
    expect(seen.get("/sse")?.headers["accept"]).toBe("text/event-stream");
  });

  it("sends lastEventId as the Last-Event-ID header", async () => {
    const [first] = await collect(await stream<HttpSseOutput>("http.sse", { url: `${base}/sse`, lastEventId: "41" }));
    expect(first).toEqual({ event: "start", data: "41" });
  });

  it("refuses another content type before the first event", async () => {
    expect(await failure(stream("http.sse", { url: `${base}/sse/wrong-type` }))).toMatchObject({ code: "BAD_CONTENT_TYPE" });
  });

  it("closes the connection when the reader stops early", async () => {
    const closing = closedPromise("/sse/endless");
    const events: HttpSseOutput[] = [];
    for await (const event of await stream<HttpSseOutput>("http.sse", { url: `${base}/sse/endless` })) {
      events.push(event);
      if (events.length === 2) break;
    }
    expect(events).toEqual([
      { event: "message", data: '{"n":1}', id: "1" },
      { event: "message", data: '{"n":2}', id: "2" },
    ]);
    await closing;
  });
});

describe("the streams of a POST", () => {
  it("http.sse gives the events of the answer to a POST of JSON, as an LLM API sends them", async () => {
    const events = await collect(
      await stream<HttpSseOutput>("http.sse", { url: `${base}/sse/chat`, json: { prompt: "one two three" }, headers: { Authorization: "Bearer key" } }),
    );
    expect(events).toEqual([
      { event: "delta", data: '{"text":"one"}' },
      { event: "delta", data: '{"text":"two"}' },
      { event: "delta", data: '{"text":"three"}' },
      { event: "done", data: "[DONE]" },
    ]);
    const request = seen.get("/sse/chat")!;
    expect(request).toMatchObject({ method: "POST", body: '{"prompt":"one two three"}' });
    expect(request.headers).toMatchObject({ "content-type": "application/json", accept: "text/event-stream", authorization: "Bearer key" });
    expect(request.headers["content-length"]).toBe(String(Buffer.byteLength('{"prompt":"one two three"}')));
  });

  it("http.ndjson sends a POST of text or JSON, a POST without a body, and a GET", async () => {
    const echo = async (input: Record<string, unknown>) => collect(await stream("http.ndjson", { url: `${base}/ndjson/echo`, ...input }));
    expect(await echo({ body: "hello" })).toEqual([{ method: "POST", type: "text/plain; charset=utf-8", body: "hello" }]);
    // A header of the input replaces the content type of the body
    expect(await echo({ json: { a: 1 }, headers: { "Content-Type": "application/vnd.api+json" } })).toEqual([
      { method: "POST", type: "application/vnd.api+json", body: '{"a":1}' },
    ]);
    expect(await echo({ method: "POST" })).toEqual([{ method: "POST", type: null, body: "" }]);
    expect(await echo({})).toEqual([{ method: "GET", type: null, body: "" }]);
  });

  it("refuses two bodies, a GET with a body, another method, and a body above the limit of the module", async () => {
    expect((await failure(stream("http.sse", { url: `${base}/sse/chat`, body: "a", json: 1 }))).message).toMatch(/http\.sse: give only one of body and json/);
    expect((await failure(stream("http.ndjson", { url: `${base}/ndjson/echo`, method: "GET", json: 1 }))).message).toMatch(/a GET request has no body/);
    expect(await failure(stream("http.sse", { url: `${base}/sse/chat`, method: "PUT", json: 1 }))).toMatchObject({ code: "VALIDATION_ERROR" });
    const small = createRegistry(createHttpModule({ allow: ["127.0.0.1"], resolve, maxRequestBytes: 8 }));
    expect(await failure(stream("http.sse", { url: `${base}/sse/chat`, json: { prompt: "a long prompt" } }, { at: small }))).toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });

  it("keeps the host check, the time limits, the deadline and the abort for a POST", async () => {
    // The default module refuses loopback before a connection: the server sees no POST
    seen.delete("/sse/chat");
    await refusal(stream("http.sse", { url: `${base}/sse/chat`, json: { prompt: "x" } }, { at: createRegistry(httpModule) }));
    expect(seen.has("/sse/chat")).toBe(false);

    const timed = await stream("http.sse", { url: `${base}/sse/endless`, json: { prompt: "x" }, timeoutMs: 100 });
    expect(await failure(collect(timed))).toMatchObject({ code: "TIMEOUT" });

    const late = await stream("http.ndjson", { url: `${base}/ndjson/endless`, body: "x" }, { deadline: Date.now() + 100 });
    expect(await failure(collect(late))).toMatchObject({ code: "TIMEOUT" });

    const closing = closedPromise("/sse/endless");
    const controller = new AbortController();
    const events = await stream<HttpSseOutput>("http.sse", { url: `${base}/sse/endless`, json: { prompt: "x" } }, { signal: controller.signal });
    expect((await events.next()).value).toEqual({ event: "message", data: '{"n":1}', id: "1" });
    expect(seen.get("/sse/endless")).toMatchObject({ method: "POST", body: '{"prompt":"x"}' });
    controller.abort();
    expect(await failure(collect(events))).toMatchObject({ code: "ABORTED" });
    await closing;
  });
});
