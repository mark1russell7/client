/**
 * The dev-tools server in the process of the test. `runDevToolsServer()` runs it under `run()` of
 * the service (CLI-11), with a fake process of the service: the listener of the service answers
 * for the Streamable HTTP face, and a signal stops the server in stages. The face answers
 * `initialize` with the server info of the configuration.
 */

import { describe, it, expect } from "vitest";
import { fakeProcess } from "@mark1russell7/service/testing";
import type { McpServerConfig } from "./config.js";
import { runDevToolsServer } from "./host.js";

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

  it("gives config.http.token to the policy, and the server admits each HTTP request with it (CLI-2b, mark mcp --http --token)", async () => {
    const proc = fakeProcess();
    const token = "dev-tools-token-0123456789";
    const { host, life, url } = await runDevToolsServer({ ...config, debug: false, http: { port: 0, token } }, { process: proc });
    // The token of the HTTP face is the token of the policy: the server checks it, not the face
    expect(host.policy.token).toBe(token);
    expect(host.mcp.policy.token).toBe(token);
    const initialize = (authorization?: string) =>
      fetch(url!, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) },
        body: INITIALIZE,
      });
    for (const authorization of [undefined, "Bearer wrong"]) {
      const refused = await initialize(authorization);
      expect(refused.status, String(authorization)).toBe(401);
      expect(refused.headers.get("www-authenticate")).toBe('Bearer realm="mcp"');
      await refused.text();
    }
    const admitted = await initialize(`Bearer ${token}`);
    expect(admitted.status).toBe(200);
    expect(await admitted.text()).toContain('"name":"start-test"');
    proc.signal("SIGTERM");
    await life.done;
  }, 60_000);

  it("gives config.http.maxSessions to the HTTP face (CLI-51, mark mcp --max-sessions)", async () => {
    const proc = fakeProcess();
    const { host, life, url } = await runDevToolsServer({ ...config, debug: false, http: { port: 0, maxSessions: 1 } }, { process: proc });
    const ids: string[] = [];
    for (let count = 0; count < 2; count++) {
      const response = await fetch(url!, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: INITIALIZE,
      });
      expect(response.status).toBe(200);
      await response.text();
      ids.push(response.headers.get("mcp-session-id") ?? "");
    }
    // The second session closed the first one, which was idle: the face keeps one session
    expect(host.mcp.state().faces[0]?.sessions).toBe(1);
    const gone = await fetch(url!, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": ids[0]! },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    expect(gone.status).toBe(404);
    await gone.text();
    proc.signal("SIGTERM");
    await life.done;
  }, 60_000);
});
