/**
 * The tools that the dev-tools MCP server exposes to Claude, compared with a committed list.
 *
 * Which tools Claude can call is a security decision (see BUGS-2026-07 H18 and
 * ARCHITECTURE-PROPOSALS-2026-10 P2). Registration happens on import, so a change in any
 * imported package can change the list without anyone noticing. This test makes every
 * change visible: it starts the built server the way Claude Code does (node dist/server.js,
 * over stdio) and lists its tools.
 *
 * If you change the exposed tools on purpose, update tools.snapshot.txt (one tool name per
 * line, sorted): copy the "received" list from the failure message.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

interface RpcResponse {
  result?: {
    tools?: Array<{ name: string }>;
    nextCursor?: string;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}

/** This function starts the built server over stdio, runs `use` with a request function, then stops the server. */
async function withServer<T>(use: (request: (method: string, params: unknown) => Promise<RpcResponse>) => Promise<T>): Promise<T> {
  const child = spawn(process.execPath, [join(packageDir, "dist", "server.js")], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  const pending = new Map<number, (message: RpcResponse) => void>();
  let nextId = 1;
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSON.parse(line) as { id?: number };
      if (message.id !== undefined) pending.get(message.id)?.(message as RpcResponse);
    } catch {
      // not a JSON-RPC line
    }
  });
  const request = (method: string, params: unknown) =>
    new Promise<RpcResponse>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  try {
    await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "tools-test", version: "0" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    return await use(request);
  } finally {
    child.kill();
  }
}

describe("dev-tools MCP server", () => {
  it("exposes exactly the tools in tools.snapshot.txt", async () => {
    const expected = readFileSync(join(packageDir, "tools.snapshot.txt"), "utf8").trim().split(/\r?\n/);

    const tools = await withServer(async (request) => {
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const response = await request("tools/list", cursor ? { cursor } : {});
        for (const tool of response.result?.tools ?? []) names.push(tool.name);
        cursor = response.result?.nextCursor;
      } while (cursor);
      return names.sort();
    });

    expect(tools).toEqual(expected);
  }, 60_000);

  it("does not let client.chain call a procedure that is not a tool (shell.exec)", async () => {
    const result = await withServer(async (request) => {
      const response = await request("tools/call", {
        name: "client.chain",
        arguments: { steps: [{ $proc: ["shell", "exec"], input: { command: "node", args: ["--version"] } }] },
      });
      return response.result;
    });

    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain("Procedure not exposed: shell.exec");
  }, 60_000);

  it("lets client.chain call an exposed procedure", async () => {
    const result = await withServer(async (request) => {
      const response = await request("tools/call", {
        name: "client.chain",
        arguments: { steps: [{ $proc: ["client", "identity"], input: { value: 42 } }] },
      });
      return response.result;
    });

    expect(result?.isError).toBeFalsy();
    expect(result?.content?.[0]?.text).toContain("42");
  }, 60_000);
});
