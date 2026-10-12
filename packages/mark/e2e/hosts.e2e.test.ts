/**
 * The front door (roadmap 2.3): `mark mcp` starts the dev-tools MCP server over stdio, and
 * `mark serve` starts the procedure server. Each host has a registry of its own (roadmap 3.1).
 */

import { describe, it, expect } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { BIN, built } from "./run.js";

const TOOLS = fileURLToPath(new URL("../../impl-mcp-dev/tools.snapshot.txt", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe.skipIf(!built)("mark mcp", () => {
  it("serves the tools of the dev-tools server over stdio, and writes only protocol lines to stdout", () => {
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ];
    // stdin ends after the requests: the server answers, then the process ends
    const run = spawnSync(process.execPath, [BIN, "mcp"], {
      input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n",
      encoding: "utf8",
      timeout: 60000,
    });
    const lines = run.stdout.split("\n").filter((line) => line.trim() !== "");
    const messages = lines.map((line) => JSON.parse(line) as { id?: number; result?: { tools: Array<{ name: string }> } });
    const list = messages.find((message) => message.id === 2);
    const expected = readFileSync(TOOLS, "utf8").split(/\r?\n/).filter(Boolean);
    expect(list?.result?.tools.length).toBe(expected.length);
  }, 90000);

  it("prints its help to stderr", () => {
    const run = spawnSync(process.execPath, [BIN, "mcp", "--help"], { encoding: "utf8", timeout: 60000 });
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("mark mcp");
  }, 90000);
});

describe.skipIf(!built)("mark serve", () => {
  it("serves the procedures of a package from mark's folder, with the token and the expose list", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [BIN, "serve", "--port", String(port), "--token", "t", "--procedures", "@procedures/fs", "--expose", "fs.exists"], {
      windowsHide: true,
    });
    try {
      let output = "";
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No start within 60 s:\n${output}`)), 60000);
        const onData = (data: Buffer): void => {
          output += data.toString();
          if (output.includes("Press Ctrl+C")) {
            clearTimeout(timer);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`mark serve exited with ${code}:\n${output}`));
        });
      });
      const call = async (path: string, token?: string): Promise<{ status: number; body: unknown }> => {
        const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ path: "." }),
        });
        return { status: response.status, body: await response.json().catch(() => undefined) };
      };
      const exists = await call("fs/exists", "t");
      expect(exists.status).toBe(200);
      expect(exists.body).toMatchObject({ exists: true });
      expect((await call("fs/exists")).status).toBe(401);
      expect((await call("fs/read", "t")).status).toBe(404);
    } finally {
      child.kill();
    }
  }, 120000);
});
