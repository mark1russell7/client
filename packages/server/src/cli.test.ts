/**
 * The server CLI starts and answers its health endpoint (a smoke test for deep dive CLI-6,
 * where the CLI crashed at startup). It runs the built dist/cli.js. The server needs a token by
 * default and serves only the procedures of `--expose` (docs review of 2026-10-08: the
 * standalone server had no token and no expose rule).
 */

import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
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

/** Start the CLI and wait for "Server started!". The output is what it printed until then. */
async function startServer(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ port: number; child: ChildProcess; output: () => string }> {
  const port = await freePort();
  const child = spawn(process.execPath, [CLI, "--port", String(port), ...args], {
    windowsHide: true,
    env: { ...process.env, SERVER_TOKEN: "", ...env },
  });
  let output = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No start within 30 s:\n${output}`)), 30000);
    const onData = (data: Buffer): void => {
      output += data.toString();
      if (output.includes("Press Ctrl+C")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`The server exited with ${code}:\n${output}`));
    });
  });
  return { port, child, output: () => output };
}

/** A procedure call over HTTP, with or without a token. */
async function call(port: number, path: string, token?: string): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: "{}",
  });
  await response.arrayBuffer();
  return response.status;
}

describe("server CLI", () => {
  it("starts, and answers /health", async () => {
    const { port, child } = await startServer([]);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as { status: string }).status).toBe("ok");
    } finally {
      child.kill();
    }
  }, 60000);

  it("needs a token by default: a random one that it prints", async () => {
    const { port, child, output } = await startServer([]);
    try {
      const token = /Token \(random, for this run\): ([0-9a-f]+)/.exec(output())?.[1];
      expect(token).toBeDefined();
      expect(await call(port, "server/connections")).toBe(401);
      expect(await call(port, "server/connections", token)).toBe(200);
    } finally {
      child.kill();
    }
  }, 60000);

  it("serves only the procedures of --expose, and takes the token of --token", async () => {
    const { port, child } = await startServer(["--token", "s3cret", "--expose", "server.connections"]);
    try {
      expect(await call(port, "server/connections", "s3cret")).toBe(200);
      expect(await call(port, "server/status", "s3cret")).toBe(404);
      expect(await call(port, "server/connections", "wrong")).toBe(401);
    } finally {
      child.kill();
    }
  }, 60000);

  it("serves without a token only with --no-token", async () => {
    const { port, child, output } = await startServer(["--no-token"]);
    try {
      expect(output()).toContain("No token");
      expect(await call(port, "server/connections")).toBe(200);
    } finally {
      child.kill();
    }
  }, 60000);
});
