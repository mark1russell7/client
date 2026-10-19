/**
 * The server transports of the Node entry (CLI-6 step 1). `@procedures/client/node` exports
 * `HttpServerTransport` and `WebSocketServerTransport` with their option types. The root and
 * `./server` export the same classes and types through deprecated aliases, so the old imports
 * keep their behavior until the next MINOR removes them.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import express from "express";
import * as nodeEntry from "./node.js";
import * as rootEntry from "./index.js";
import * as serverEntry from "./server/index.js";
import { HttpServerTransport, WebSocketServerTransport } from "./node.js";
import type {
  HttpServerTransportOptions,
  HttpUrlStrategy,
  WebSocketServerTransportOptions,
  WebSocketAuthHandler,
  WebSocketConnectionHandler,
  WebSocketMessage,
} from "./node.js";
import {
  // The deprecated aliases of the root: this test pins that they still work
  HttpServerTransport as RootHttpServerTransport,
  WebSocketServerTransport as RootWebSocketServerTransport,
} from "./index.js";
import type {
  HttpServerTransportOptions as RootHttpServerTransportOptions,
  HttpUrlStrategy as RootHttpUrlStrategy,
  WebSocketServerTransportOptions as RootWebSocketServerTransportOptions,
  WebSocketAuthHandler as RootWebSocketAuthHandler,
  WebSocketConnectionHandler as RootWebSocketConnectionHandler,
  WebSocketMessage as RootWebSocketMessage,
} from "./index.js";
import type { RequestHandler } from "./server/types.js";

/** A request handler that the tests never call: the constructors only keep it. */
const handler: RequestHandler = {
  handle: async () => {
    throw new Error("The test does not call the handler");
  },
};

describe("@procedures/client/node: the server transports (CLI-6)", () => {
  it("exports HttpServerTransport and WebSocketServerTransport as classes", () => {
    expect(typeof nodeEntry.HttpServerTransport).toBe("function");
    expect(typeof nodeEntry.WebSocketServerTransport).toBe("function");
    expect(nodeEntry.HttpServerTransport.name).toBe("HttpServerTransport");
    expect(nodeEntry.WebSocketServerTransport.name).toBe("WebSocketServerTransport");
  });

  it("gives the same class as the root and ./server (the deprecated aliases)", () => {
    expect(rootEntry.HttpServerTransport).toBe(nodeEntry.HttpServerTransport);
    expect(rootEntry.WebSocketServerTransport).toBe(nodeEntry.WebSocketServerTransport);
    expect(serverEntry.HttpServerTransport).toBe(nodeEntry.HttpServerTransport);
    expect(serverEntry.WebSocketServerTransport).toBe(nodeEntry.WebSocketServerTransport);
  });

  it("keeps the strategies in the root and in ./node, with the same functions", () => {
    expect(rootEntry.defaultServerUrlStrategy).toBe(nodeEntry.defaultServerUrlStrategy);
    expect(rootEntry.rpcServerUrlStrategy).toBe(nodeEntry.rpcServerUrlStrategy);
    expect(serverEntry.defaultServerUrlStrategy).toBe(nodeEntry.defaultServerUrlStrategy);
  });

  it("an alias of the root works with new, instanceof and extends", () => {
    const http = new RootHttpServerTransport(handler, { app: express() });
    expect(http).toBeInstanceOf(HttpServerTransport);
    expect(http.name).toBe("http");
    const ws = new RootWebSocketServerTransport(handler, { heartbeat: false });
    expect(ws).toBeInstanceOf(WebSocketServerTransport);

    // A subclass of an alias is a subclass of the class of ./node
    class NamedWebSocketServerTransport extends RootWebSocketServerTransport {
      readonly label = "named";
    }
    const named = new NamedWebSocketServerTransport(handler, { heartbeat: false });
    expect(named).toBeInstanceOf(WebSocketServerTransport);
    expect(named).toBeInstanceOf(RootWebSocketServerTransport);
    expect(named.label).toBe("named");

    // The instance types are the same in the two directions
    const fromRoot: HttpServerTransport = http;
    const fromNode: RootHttpServerTransport = new HttpServerTransport(handler, { app: express() });
    expect(fromRoot).toBeInstanceOf(RootHttpServerTransport);
    expect(fromNode).toBeInstanceOf(HttpServerTransport);
  });

  it("the types of the root are the types of ./node", () => {
    expectTypeOf<RootHttpServerTransport>().toEqualTypeOf<HttpServerTransport>();
    expectTypeOf<RootWebSocketServerTransport>().toEqualTypeOf<WebSocketServerTransport>();
    expectTypeOf<typeof RootHttpServerTransport>().toEqualTypeOf<typeof HttpServerTransport>();
    expectTypeOf<typeof RootWebSocketServerTransport>().toEqualTypeOf<typeof WebSocketServerTransport>();
    expectTypeOf<RootHttpServerTransportOptions>().toEqualTypeOf<HttpServerTransportOptions>();
    expectTypeOf<RootHttpUrlStrategy>().toEqualTypeOf<HttpUrlStrategy>();
    expectTypeOf<RootWebSocketServerTransportOptions>().toEqualTypeOf<WebSocketServerTransportOptions>();
    expectTypeOf<RootWebSocketAuthHandler>().toEqualTypeOf<WebSocketAuthHandler>();
    expectTypeOf<RootWebSocketConnectionHandler>().toEqualTypeOf<WebSocketConnectionHandler>();
    expectTypeOf<RootWebSocketMessage>().toEqualTypeOf<WebSocketMessage>();
    expectTypeOf<RootWebSocketMessage<{ n: number }>>().toEqualTypeOf<WebSocketMessage<{ n: number }>>();
  });
});
