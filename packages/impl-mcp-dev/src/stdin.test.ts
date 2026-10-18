/**
 * The built server ends when the client closes its input (CLI-10). Before, the stdio host did not
 * watch the end of stdin: a server whose client was gone stayed alive while a handle kept the
 * process up. This test starts `node dist/server.js` as Claude Code does, answers `initialize`,
 * closes stdin and waits for the exit.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("the stdio server", () => {
  it("stops and ends its process when stdin closes", async () => {
    const child = spawn(process.execPath, [join(packageDir, "dist", "server.js")], { stdio: ["pipe", "pipe", "ignore"] });
    try {
      const initialized = new Promise<unknown>((resolve) => {
        createInterface({ input: child.stdout }).on("line", (line) => {
          try {
            const message = JSON.parse(line) as { id?: number };
            if (message.id === 1) resolve(message);
          } catch {
            // not a JSON-RPC line
          }
        });
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "stdin-test", version: "0" } },
        }) + "\n",
      );
      expect(await initialized).toMatchObject({ result: { serverInfo: { name: "impl-mcp-dev" } } });

      const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
      child.stdin.end();
      expect(await exited).toBe(0);
    } finally {
      if (child.exitCode === null) child.kill();
    }
  }, 60_000);
});
