/**
 * Procedure paths of each length on each face (CLI-28). A path has one segment or more: a path of
 * one segment (jarvis has `["morning"]` and `["capture"]`) has the empty service. The transport
 * contract (`src/testing/transport-contract.ts`, CLI-85) calls paths of 1, 2 and 4 segments on
 * each face. This file has the checks of `Server.handle`, of the URL and of the other parts that
 * name a path. The version of the URL keeps its old form on a path of two segments or more.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, request, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z } from "zod";
import { Client } from "../client/client.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { HttpServerTransport } from "../adapters/http/server/transport.js";
import { procedureHandler } from "../adapters/http/server/handler.js";
import { bodyPathAddressing } from "../adapters/http/server/addressing.js";
import { rpcServerUrlStrategy } from "../adapters/http/server/strategies.js";
import { defaultUrlPattern } from "../adapters/http/shared/strategies.js";
import { HTTPMethod } from "../adapters/http/shared/constants.js";
import { LocalTransport } from "../adapters/local/client/transport.js";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import type { ProcedureRegistry } from "../procedures/registry.js";
import { ProcedureServer } from "./procedure-server.js";
import { methodName, methodToPath, pathToMethod } from "./method.js";

const PATHS: string[][] = [["morning"], ["notes", "list"], ["a", "b", "c", "d"]];

function registry(): ProcedureRegistry {
  return createRegistry({
    name: "any-length",
    procedures: PATHS.map((path) =>
      createProcedure()
        .path(path)
        .input(z.object({}).passthrough())
        .output(z.unknown())
        .meta({ effects: { reads: [], writes: [] } })
        .handler(async (input, ctx) => ({ path: ctx.path, input }))
        .build(),
    ),
  });
}

function server(): ProcedureServer {
  const value = new ProcedureServer({ registry: registry() });
  value.registerFromRegistry();
  return value;
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

describe("paths of each length on Server.handle (CLI-28)", () => {
  it("serves a path of 1, 2 and 4 segments", async () => {
    const value = server();
    for (const path of PATHS) {
      const response = await value.handle({ id: "1", method: pathToMethod(path), payload: {}, metadata: {} });
      expect(response.payload).toEqual({ path, input: {} });
    }
    expect(value.hasProcedure(["morning"])).toBe(true);
  });
});

describe("the URL of a path (CLI-28)", () => {
  const roundTrip = (path: string[], version?: string): { url: string; path: string[]; version: string | undefined } => {
    const url = defaultUrlPattern.format({ ...pathToMethod(path), ...(version ? { version } : {}) }, "/api");
    const parsed = defaultUrlPattern.parse(url.slice("/api".length), HTTPMethod.POST);
    return { url, path: parsed ? methodToPath(parsed) : [], version: parsed?.version };
  };

  it("round-trips a path of 1, 2 and 4 segments", () => {
    expect(roundTrip(["morning"])).toEqual({ url: "/api/morning", path: ["morning"], version: undefined });
    expect(roundTrip(["notes", "list"])).toEqual({ url: "/api/notes/list", path: ["notes", "list"], version: undefined });
    expect(roundTrip(["a", "b", "c", "d"])).toEqual({ url: "/api/a.b.c/d", path: ["a", "b", "c", "d"], version: undefined });
  });

  it("keeps the old form of a version on a path of two segments or more", () => {
    expect(roundTrip(["notes", "list"], "v2")).toEqual({ url: "/api/v2/notes/list", path: ["notes", "list"], version: "v2" });
    expect(roundTrip(["a", "b", "c", "d"], "2")).toEqual({ url: "/api/2/a.b.c/d", path: ["a", "b", "c", "d"], version: "2" });
    // The old 3-segment form parses as before
    expect(defaultUrlPattern.parse("/v2/users/get", HTTPMethod.POST)).toEqual({ version: "v2", service: "users", operation: "get" });
    // A path of two segments that starts with a version-like segment is a path, not a version
    expect(roundTrip(["v2", "morning"])).toEqual({ url: "/api/v2/morning", path: ["v2", "morning"], version: undefined });
  });

  it("puts no version in the URL of a path of one segment: it would read as a service", () => {
    expect(roundTrip(["morning"], "v2")).toEqual({ url: "/api/morning", path: ["morning"], version: undefined });
  });

  it("URI-encodes each segment, so a segment never makes a URL separator", () => {
    expect(roundTrip(["docs/v2", "get"])).toEqual({ url: "/api/docs%2Fv2/get", path: ["docs/v2", "get"], version: undefined });
    expect(roundTrip(["a b", "c?d"])).toEqual({ url: "/api/a%20b/c%3Fd", path: ["a b", "c?d"], version: undefined });
    // A segment that is not valid URI encoding stays as it is
    expect(defaultUrlPattern.parse("/a%zz/b", HTTPMethod.POST)).toEqual({ service: "a%zz", operation: "b" });
  });

  it("names a method of one segment by its operation", () => {
    expect(methodName(pathToMethod(["morning"]))).toBe("morning");
    expect(methodName(pathToMethod(["a", "b", "c", "d"]))).toBe("a.b.c.d");
  });

  it("reads a path of one segment with the RPC strategy", () => {
    expect(rpcServerUrlStrategy({ method: "POST", path: "/rpc/morning" })).toEqual({ service: "", operation: "morning" });
    expect(rpcServerUrlStrategy({ method: "POST", path: "/rpc/notes/list" })).toEqual({ service: "notes", operation: "list" });
  });
});

describe("other parts that name a path of one segment (CLI-28)", () => {
  it("calls a path of one segment through the body of a single endpoint", async () => {
    const handler = procedureHandler(server(), { basePath: "/api/proc", addressing: bodyPathAddressing() });
    const port = await listen(createServer((req, res) => {
      if (!handler(req, res)) res.end("app");
    }));
    const body = await new Promise<string>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/proc", headers: { "content-type": "application/json" } }, (res: IncomingMessage) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () => resolve(text));
      });
      req.on("error", reject);
      req.end(JSON.stringify({ path: ["morning"], input: { at: 7 } }));
    });
    expect(JSON.parse(body)).toEqual({ path: ["morning"], input: { at: 7 } });
  });

  it("finds a handler of LocalTransport with the key of one segment", async () => {
    const client = new Client({ transport: new LocalTransport({ handlers: { morning: () => "good morning" } }), throwOnError: true });
    expect(await client.call(pathToMethod(["morning"]), {})).toBe("good morning");
  });

  it("sends a version on a path of two segments over HTTP, and the server ignores it", async () => {
    const handler = procedureHandler(server());
    const port = await listen(createServer((req, res) => {
      if (!handler(req, res)) res.end("app");
    }));
    const client = new Client({ transport: new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` }), throwOnError: true });
    expect(await client.call({ service: "notes", operation: "list", version: "v2" }, {})).toEqual({ path: ["notes", "list"], input: {} });
  });
});

describe("segments that look like URL separators (CLI-28)", () => {
  /** A registry with a segment that has a slash, and the paths that a split or a ".." could reach. */
  function tricky(): ProcedureRegistry {
    const paths = [["x/y", "z"], ["x", "y", "z"], ["list"], ["notes"], ["notes", "list"]];
    return createRegistry({
      name: "tricky",
      procedures: paths.map((path) =>
        createProcedure()
          .path(path)
          .input(z.object({}).passthrough())
          .output(z.unknown())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async (_input, ctx) => ({ path: ctx.path }))
          .build(),
      ),
    });
  }

  function trickyServer(): ProcedureServer {
    const value = new ProcedureServer({ registry: tricky() });
    value.registerFromRegistry();
    return value;
  }

  /** One raw POST: Node sends the path as it is, without a normalization of ".." */
  function post(port: number, path: string, body = "{}"): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path, headers: { "content-type": "application/json" } }, (res: IncomingMessage) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }

  async function startRaw(): Promise<number> {
    const handler = procedureHandler(trickyServer());
    const single = procedureHandler(trickyServer(), { basePath: "/proc", addressing: bodyPathAddressing() });
    return listen(createServer((req, res) => {
      if (!single(req, res) && !handler(req, res)) res.end("app");
    }));
  }

  it("does not split a %2F inside a segment into two segments", async () => {
    const port = await startRaw();
    expect((await post(port, "/api/x%2Fy/z")).body).toEqual({ path: ["x/y", "z"] });
    // The client encodes the slash, so its call reaches the same procedure, and not ["x", "y", "z"]
    const client = new Client({ transport: new HttpTransport({ baseUrl: `http://127.0.0.1:${port}/api` }), throwOnError: true });
    expect(await client.call(pathToMethod(["x/y", "z"]), {})).toEqual({ path: ["x/y", "z"] });
    expect(await client.call(pathToMethod(["x", "y", "z"]), {})).toEqual({ path: ["x", "y", "z"] });
    // The Express shim reads the same URL
    const app = express();
    const http = createServer(app);
    const transport = new HttpServerTransport(trickyServer(), { app, httpServer: http });
    await transport.start();
    const shimPort = await listen(http);
    cleanups.push(() => transport.stop());
    expect((await post(shimPort, "/api/x%2Fy/z")).body).toEqual({ path: ["x/y", "z"] });
  });

  it("answers NOT_FOUND for a \"..\" segment, and never reaches another procedure", async () => {
    const port = await startRaw();
    for (const url of ["/api/notes/..", "/api/../list", "/api/%2E%2E/list", "/api/notes/%2E%2E", "/api/notes../list", "/api/.notes/list"]) {
      const res = await post(port, url);
      expect([res.status, res.body["code"]], url).toEqual([404, "NOT_FOUND"]);
    }
    // The same through the body of a single endpoint, and through a method of a frame
    for (const path of [["..", "list"], ["notes", ".."]]) {
      const res = await post(port, "/proc", JSON.stringify({ path }));
      expect([res.status, res.body["code"]], JSON.stringify(path)).toEqual([404, "NOT_FOUND"]);
    }
    const value = trickyServer();
    for (const method of [{ service: "..", operation: "list" }, { service: "notes", operation: ".." }, { service: "notes.", operation: "list" }, { service: "notes", operation: "" }]) {
      const response = await value.handle({ id: "1", method, payload: {}, metadata: {} });
      expect(response.status, JSON.stringify(method)).toMatchObject({ type: "error", code: "NOT_FOUND" });
    }
    // ".".split gives the empty segments around each dot
    expect(methodToPath({ service: "..", operation: "list" })).toEqual(["", "", "", "list"]);
    expect(methodToPath({ service: "", operation: "list" })).toEqual(["list"]);
  });
});
