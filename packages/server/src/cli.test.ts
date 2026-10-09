/**
 * The server CLI starts and answers its health endpoint (a smoke test for deep dive CLI-6,
 * where the CLI crashed at startup). It runs the built dist/cli.js.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("server CLI", () => {
  it("starts, and answers /health", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [CLI, "--port", String(port)], { windowsHide: true });
    try {
      let output = "";
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No start within 30 s:\n${output}`)), 30000);
        const onData = (data: Buffer): void => {
          output += data.toString();
          if (output.includes("Server started!")) {
            clearTimeout(timer);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`The server exited with ${code}:\n${output}`));
        });
      });
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as { status: string }).status).toBe("ok");
    } finally {
      child.kill();
    }
  }, 60000);
});
