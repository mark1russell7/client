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

async function listTools(): Promise<string[]> {
  const child = spawn(process.execPath, [join(packageDir, "dist", "server.js")], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  const pending = new Map<number, (message: { result?: { tools: Array<{ name: string }>; nextCursor?: string } }) => void>();
  let nextId = 1;
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSON.parse(line) as { id?: number };
      if (message.id !== undefined) pending.get(message.id)?.(message as never);
    } catch {
      // not a JSON-RPC line
    }
  });
  const request = (method: string, params: unknown) =>
    new Promise<{ result?: { tools: Array<{ name: string }>; nextCursor?: string } }>((resolve) => {
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
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await request("tools/list", cursor ? { cursor } : {});
      for (const tool of response.result?.tools ?? []) names.push(tool.name);
      cursor = response.result?.nextCursor;
    } while (cursor);
    return names.sort();
  } finally {
    child.kill();
  }
}

describe("dev-tools MCP server", () => {
  it("exposes exactly the tools in tools.snapshot.txt", async () => {
    const expected = readFileSync(join(packageDir, "tools.snapshot.txt"), "utf8").trim().split(/\r?\n/);

    const tools = await listTools();

    expect(tools).toEqual(expected);
  }, 60_000);
});
