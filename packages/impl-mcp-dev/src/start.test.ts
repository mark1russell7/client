/**
 * `startDevToolsServer()` in the process of the test (CLI-10): the host of `createMcpHost()` with
 * the face of the configuration. Over Streamable HTTP, the test can call the server without a
 * child process. The face answers `initialize` with the server info of the configuration.
 */

import { describe, it, expect } from "vitest";
import type { McpServerConfig } from "./config.js";
import { startDevToolsServer } from "./host.js";

const config: McpServerConfig = {
  bundles: ["@procedures/bundle-mcp"],
  serverName: "start-test",
  serverVersion: "0",
  debug: true,
  toolTimeoutMs: 0,
  // Port 0: the system gives a free port
  http: { port: 0 },
};

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
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "start-test", version: "0" } },
        }),
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
