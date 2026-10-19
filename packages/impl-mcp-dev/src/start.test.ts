/**
 * The dev-tools server in the process of the test. `runDevToolsServer()` runs it under `run()` of
 * the service (CLI-11), with a fake process of the service: the listener of the service answers
 * for the Streamable HTTP face, and a signal stops the server in stages. `startDevToolsServer()`
 * (deprecated) starts the host of `createMcpHost()` with a listener of the face (CLI-10). Each
 * face answers `initialize` with the server info of the configuration.
 */

import { describe, it, expect } from "vitest";
import { fakeProcess } from "@mark1russell7/service/testing";
import type { McpServerConfig } from "./config.js";
import { runDevToolsServer, startDevToolsServer } from "./host.js";

/** The body of an `initialize` request. */
const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "start-test", version: "0" } },
});

const config: McpServerConfig = {
  bundles: ["@procedures/bundle-mcp"],
  serverName: "start-test",
  serverVersion: "0",
  debug: true,
  toolTimeoutMs: 0,
  // Port 0: the system gives a free port
  http: { port: 0 },
};

describe("runDevToolsServer", () => {
  it("serves Streamable HTTP on a listener of the service, and a signal stops it in stages", async () => {
    const proc = fakeProcess();
    const { host, life, url } = await runDevToolsServer(config, { process: proc });
    expect(life.state).toBe("running");
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(host.mcp.state().faces[0]?.toolCount).toBeGreaterThan(50);
    const response = await fetch(url!, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: INITIALIZE,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"name":"start-test"');

    proc.signal("SIGTERM");
    await life.done;
    await host.mcp.closed;
    expect(host.mcp.state().running).toBe(false);
    expect(proc.exits).toHaveLength(1);
  }, 60_000);
});

describe("startDevToolsServer", () => {
  it("starts the face of the configuration, and stops one time", async () => {
    const host = await startDevToolsServer(config);
    try {
      const face = host.mcp.state().faces[0];
      expect(face).toMatchObject({ transport: "http", running: true });
      expect(face?.toolCount).toBeGreaterThan(50);
      const response = await fetch(face!.url!, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: INITIALIZE,
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"name":"start-test"');
    } finally {
      await host.mcp.stop();
    }
    await host.mcp.closed;
    expect(host.mcp.state().running).toBe(false);
  }, 60_000);
});
