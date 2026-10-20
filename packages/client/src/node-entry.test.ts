/**
 * The server transports of the Node entry (CLI-6). Only `@procedures/client/node` exports
 * `HttpServerTransport` and `WebSocketServerTransport` with their option types. Step 1 kept them in
 * the root and in `./server` as deprecated aliases. Step 2 removes these aliases, so the root and
 * `./server` import no `http`, no `ws` and no `express`.
 *
 * The URL strategy of `HttpServerTransport` takes a structural request (CLI-61): a `Request` of
 * Express agrees with it, and so does the `UrlRequest` of `procedureHandler`.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import express, { type Request } from "express";
import * as nodeEntry from "./node.js";
import * as rootEntry from "./index.js";
import * as serverEntry from "./server/index.js";
import { HttpServerTransport, WebSocketServerTransport, defaultServerUrlStrategy, rpcServerUrlStrategy } from "./node.js";
import type { HttpUrlStrategy, UrlRequest, UrlStrategyRequest, NodeUrlStrategy } from "./node.js";
import type { Method } from "./client/types.js";
import type { RequestHandler } from "./server/types.js";

/** A request handler that the tests never call: the constructors only keep it. */
const handler: RequestHandler = {
  handle: async () => {
    throw new Error("The test does not call the handler");
  },
};

/** The names that step 1 deprecated in the root and in `./server`, and that step 2 removes. */
const REMOVED_VALUES = ["HttpServerTransport", "WebSocketServerTransport"] as const;

describe("@procedures/client/node: the server transports (CLI-6)", () => {
  it("exports HttpServerTransport and WebSocketServerTransport as classes", () => {
    expect(typeof nodeEntry.HttpServerTransport).toBe("function");
    expect(typeof nodeEntry.WebSocketServerTransport).toBe("function");
    expect(nodeEntry.HttpServerTransport.name).toBe("HttpServerTransport");
    expect(nodeEntry.WebSocketServerTransport.name).toBe("WebSocketServerTransport");
    expect(new HttpServerTransport(handler, { app: express() }).name).toBe("http");
    expect(new WebSocketServerTransport(handler, { heartbeat: false }).name).toBe("websocket");
  });

  it("the root and ./server do not export the server transports (step 2)", () => {
    for (const name of REMOVED_VALUES) {
      expect(name in rootEntry, `the root exports ${name}`).toBe(false);
      expect(name in serverEntry, `./server exports ${name}`).toBe(false);
    }
    expectTypeOf(rootEntry).not.toHaveProperty("HttpServerTransport");
    expectTypeOf(rootEntry).not.toHaveProperty("WebSocketServerTransport");
    expectTypeOf(serverEntry).not.toHaveProperty("HttpServerTransport");
    expectTypeOf(serverEntry).not.toHaveProperty("WebSocketServerTransport");
  });

  it("keeps the strategies in the root, in ./server and in ./node, with the same functions", () => {
    expect(rootEntry.defaultServerUrlStrategy).toBe(nodeEntry.defaultServerUrlStrategy);
    expect(rootEntry.rpcServerUrlStrategy).toBe(nodeEntry.rpcServerUrlStrategy);
    expect(serverEntry.defaultServerUrlStrategy).toBe(nodeEntry.defaultServerUrlStrategy);
    expect(serverEntry.rpcServerUrlStrategy).toBe(nodeEntry.rpcServerUrlStrategy);
  });
});

describe("HttpUrlStrategy takes a structural request (CLI-61)", () => {
  it("its parameter is UrlStrategyRequest, and an Express Request and a UrlRequest agree with it", () => {
    expectTypeOf<Parameters<HttpUrlStrategy>[0]>().toEqualTypeOf<UrlStrategyRequest>();
    expectTypeOf<Request>().toExtend<UrlStrategyRequest>();
    expectTypeOf<UrlRequest>().toExtend<UrlStrategyRequest>();
    // The strategies of the package are URL strategies of the transport
    expectTypeOf(defaultServerUrlStrategy).toExtend<HttpUrlStrategy>();
    expectTypeOf(rpcServerUrlStrategy).toExtend<HttpUrlStrategy>();
  });

  it("a strategy serves the view of procedureHandler too", () => {
    const strategy: HttpUrlStrategy = (req) => {
      const tenant = req.headers["x-tenant"];
      return req.path.startsWith("/rpc/") && typeof tenant === "string" ? { service: tenant, operation: req.path.slice("/rpc/".length) } : null;
    };
    const nodeStrategy: NodeUrlStrategy = (view) => strategy(view);
    const view: UrlRequest = { method: "POST", path: "/rpc/list", url: "/rpc/list?x=1", headers: { "x-tenant": "acme" }, query: { x: "1" } };
    expect(nodeStrategy(view, undefined as never)).toEqual<Method>({ service: "acme", operation: "list" });
    expect(strategy({ ...view, headers: {} })).toBeNull();
  });

  it("the transport gives the strategy the request with its method, path, url, headers and query", async () => {
    const seen: UrlStrategyRequest[] = [];
    const app = express();
    const transport = new HttpServerTransport(handler, {
      app,
      port: 0,
      urlStrategy: (req) => {
        seen.push(req);
        return null;
      },
    });
    await transport.start();
    try {
      const response = await fetch(`http://127.0.0.1:${transport.port()}/api/a/b?q=1`, { method: "POST", headers: { "content-type": "application/json", "x-tenant": "acme" }, body: "{}" });
      await response.text();
    } finally {
      await transport.stop();
    }
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe("POST");
    expect(req?.path).toBe("/api/a/b");
    expect(req?.url).toBe("/api/a/b?q=1");
    expect(req?.headers["x-tenant"]).toBe("acme");
    expect(req?.query).toEqual({ q: "1" });
  });
});
