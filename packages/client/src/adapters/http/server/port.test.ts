/**
 * The port of an HTTP server transport. With the option `port` 0, the system gives a free port,
 * and `port()` returns it, so a test or a host does not find a free port before the start.
 */

import { describe, expect, it } from "vitest";
import express from "express";
import { request } from "node:http";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { HttpServerTransport } from "./transport.js";

describe("HttpServerTransport.port()", () => {
  it("returns the port that the system gave for port 0, and undefined before the start and after the stop", async () => {
    const server = new ProcedureServer();
    const transport = new HttpServerTransport(server, { app: express(), port: 0, host: "127.0.0.1" });
    expect(transport.port()).toBeUndefined();

    await transport.start();
    const port = transport.port();
    expect(port).toBeGreaterThan(0);
    // The server answers on that port: a GET of no route gets a response, not a refused connection
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/", method: "GET" }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBeGreaterThan(0);

    await transport.stop();
    expect(transport.port()).toBeUndefined();
  });
});
