/**
 * The CORS of a procedure server for the request headers of `HttpTransport`. Node sends no
 * preflight request, so each test sends the preflight request of a browser with `node:http`: the
 * method `OPTIONS`, the origin of the page and the names of the request headers.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as z from "zod";
import express from "express";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "../../../client/client.js";
import { createRetryMiddleware } from "../../../client/middleware/retry.js";
import { createProcedure } from "../../../procedures/define.js";
import { createRegistry } from "../../../procedures/module.js";
import { pathToMethod } from "../../../server/method.js";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { HttpTransport } from "../client/transport.js";
import { HttpServerTransport } from "./transport.js";
import { DEFAULT_CORS_EXPOSED_HEADERS, DEFAULT_CORS_HEADERS } from "./cors.js";
import { ms } from "../../../duration.js";

const APP = "https://app.example";
const echo = pathToMethod(["t", "echo"]);

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/**
 * A procedure server over HTTP with the CORS of the page `APP`, or of the origins `origin`. `routes`
 * adds the routes of the app after the transport.
 */
async function start(allowedHeaders?: string[], origin: string | string[] = [APP], routes?: (app: express.Express) => void): Promise<number> {
  const registry = createRegistry({
    name: "t",
    procedures: [
      createProcedure()
        .path(["t", "echo"])
        .input(z.object({ n: z.number() }))
        .output(z.number())
        .meta({ effects: {} })
        .handler(async ({ n }) => n)
        .build(),
    ],
  });
  const server = new ProcedureServer({ registry });
  server.registerFromRegistry();
  const app = express();
  const http = createServer(app);
  const corsOptions = allowedHeaders === undefined ? { origin } : { origin, allowedHeaders };
  server.addTransport(new HttpServerTransport(server, { app, httpServer: http, cors: true, corsOptions }));
  routes?.(app);
  await server.start();
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  cleanups.push(async () => {
    await server.stop();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  return (http.address() as AddressInfo).port;
}

/** This function sends one request with `node:http`, so the test sets the headers of a browser. */
async function send(port: number, method: string, headers: Record<string, string>, path = "/api"): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** The preflight request of a page of `APP` for a POST with the request headers `names`. */
const preflight = (port: number, names: readonly string[]) =>
  send(port, "OPTIONS", { origin: APP, "access-control-request-method": "POST", "access-control-request-headers": names.join(",") });

/** The names of a header list, in lowercase. */
const namesOf = (value: string | string[] | undefined): string[] => String(value ?? "").split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== "");

/**
 * The request headers of `HttpTransport`, as a browser names them in a preflight request: a call
 * with the retry middleware, a batch of two calls, and a call with a key of the application.
 */
async function sentHeaderNames(port: number): Promise<string[][]> {
  const sent: string[][] = [];
  const spy: typeof fetch = (url, init) => {
    sent.push([...new Headers(init?.headers).keys()].sort());
    return fetch(url, init);
  };
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const retried = new Client({ transport: new HttpTransport({ baseUrl, fetch: spy }), throwOnError: true }).use(createRetryMiddleware({ retryDelay: ms(1), jitter: 0 }));
  expect(await retried.call(echo, { n: 1 })).toBe(1);
  const batched = new Client({ transport: new HttpTransport({ baseUrl, fetch: spy, batch: true }), throwOnError: true });
  expect(await Promise.all([batched.call(echo, { n: 2 }), batched.call(echo, { n: 3 })])).toEqual([2, 3]);
  const plain = new Client({ transport: new HttpTransport({ baseUrl, fetch: spy }), throwOnError: true });
  expect(await plain.call(echo, { n: 4 }, { metadata: { tenant: "north" } })).toBe(4);
  return sent;
}

describe("the CORS of the request headers of HttpTransport", () => {
  it("answers the preflight request of each request of HttpTransport, with no allowedHeaders option", async () => {
    const port = await start();
    const sent = await sentHeaderNames(port);
    // The test examines the three headers that the fixed list did not have
    expect(sent.flat()).toEqual(expect.arrayContaining(["idempotency-key", "procedures-batch", "tenant"]));
    for (const names of sent) {
      const answer = await preflight(port, names);
      expect(answer.status).toBe(204);
      expect(answer.headers["access-control-allow-origin"]).toBe(APP);
      expect(namesOf(answer.headers["access-control-allow-headers"])).toEqual(expect.arrayContaining(names));
      expect(namesOf(answer.headers["vary"])).toEqual(expect.arrayContaining(["origin", "access-control-request-headers"]));
    }
  });

  it("has each header of the protocol in the default list, so a fixed list from it also passes", async () => {
    const port = await start();
    const sent = await sentHeaderNames(port);
    const listed = DEFAULT_CORS_HEADERS.map((name) => name.toLowerCase());
    // Only the key of the application is not in the list
    expect([...new Set(sent.flat())].filter((name) => !listed.includes(name))).toEqual(["tenant"]);
  });

  it("names only the headers of the allowedHeaders option, when it is given", async () => {
    const port = await start(["Content-Type", "X-Metadata"]);
    const answer = await preflight(port, ["content-type", "tenant"]);
    expect(answer.status).toBe(204);
    expect(answer.headers["access-control-allow-headers"]).toBe("Content-Type, X-Metadata");
    expect(namesOf(answer.headers["vary"])).not.toContain("access-control-request-headers");
  });

  it("does not name a requested name that is not a header token", async () => {
    const port = await start();
    const answer = await preflight(port, ["tenant", "a(b)", "c d", "tenant"]);
    const names = namesOf(answer.headers["access-control-allow-headers"]);
    expect(names).toContain("tenant");
    expect(names.filter((name) => name === "tenant")).toHaveLength(1);
    expect(names).not.toContain("a(b)");
    expect(names).not.toContain("c d");
  });

  it("exposes the response headers of the protocol, so a page reads the answer of a batch", async () => {
    const port = await start();
    const answer = await send(port, "POST", { origin: APP, "content-type": "application/json", "procedures-batch": "1" });
    expect(answer.headers["access-control-allow-origin"]).toBe(APP);
    expect(namesOf(answer.headers["access-control-expose-headers"])).toEqual(DEFAULT_CORS_EXPOSED_HEADERS.map((name) => name.toLowerCase()));
    expect(DEFAULT_CORS_EXPOSED_HEADERS).toEqual(["Procedures-Protocol", "Procedures-Batch", "Retry-After"]);
  });
});

describe("the credentials of the CORS of HttpServerTransport", () => {
  it("sends Access-Control-Allow-Credentials for a named origin, and not for the origin \"*\"", async () => {
    const named = await start();
    const any = await start(undefined, "*");
    const answers = [await preflight(named, ["content-type"]), await preflight(any, ["content-type"])];
    expect(answers.map((answer) => [answer.status, answer.headers["access-control-allow-origin"], answer.headers["access-control-allow-credentials"]])).toEqual([
      [204, APP, "true"],
      [204, "*", undefined],
    ]);
    const call = { origin: APP, "content-type": "application/json", "procedures-batch": "1" };
    const calls = [await send(named, "POST", call), await send(any, "POST", call)];
    expect(calls.map((answer) => answer.headers["access-control-allow-credentials"])).toEqual(["true", undefined]);
  });
});

describe("the reach of the CORS of HttpServerTransport", () => {
  /** The names of the CORS headers of an answer. */
  const corsNames = (headers: IncomingHttpHeaders): string[] => Object.keys(headers).filter((name) => name.startsWith("access-control-"));

  it("gives a route of the app outside the base path no CORS header, and its OPTIONS request reaches the route", async () => {
    const port = await start(undefined, [APP], (app) => {
      app.options("/files", (_req, res) => {
        res.status(200).send("options of the app");
      });
      app.get("/files", (_req, res) => {
        res.send("files of the app");
      });
    });
    const options = await send(port, "OPTIONS", { origin: APP, "access-control-request-method": "GET" }, "/files");
    const get = await send(port, "GET", { origin: APP }, "/files");
    expect([options.status, options.body, get.status, get.body]).toEqual([200, "options of the app", 200, "files of the app"]);
    expect([corsNames(options.headers), corsNames(get.headers)]).toEqual([[], []]);
  });

  it("answers the preflight of a batch at the base path itself, and of a call under it", async () => {
    const port = await start();
    const batch = await preflight(port, ["content-type", "procedures-batch"]);
    const call = await send(port, "OPTIONS", { origin: APP, "access-control-request-method": "POST" }, "/api/t/echo");
    expect([batch.status, batch.headers["access-control-allow-origin"], call.status, call.headers["access-control-allow-origin"]]).toEqual([204, APP, 204, APP]);
  });
});
