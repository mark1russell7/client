/**
 * server.start, server.stop and server.status against the lockfiles of a temporary home folder.
 *
 * The lockfile module reads the home folder when it loads, so this file sets HOME (and
 * USERPROFILE on Windows) before it imports the procedures. The tests never use the lockfiles of
 * the user. A server of a test is an HTTP server that answers each request with a peer id. A test
 * that stops a server starts it as a child process, because server.stop signals its PID.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnyProcedure } from "@procedures/client";

const home = mkdtempSync(join(tmpdir(), "server-procedures-home-"));
const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] };
process.env["HOME"] = home;
process.env["USERPROFILE"] = home;

type Lockfiles = typeof import("@procedures/peer/lockfile");
let lockfiles: Lockfiles;
let start: AnyProcedure;
let stop: AnyProcedure;
let status: AnyProcedure;

beforeAll(async () => {
  lockfiles = await import("@procedures/peer/lockfile");
  start = (await import("./server.start.js")).serverStartProcedure as unknown as AnyProcedure;
  stop = (await import("./server.stop.js")).serverStopProcedure as unknown as AnyProcedure;
  status = (await import("./server.status.js")).serverStatusProcedure as unknown as AnyProcedure;
  expect(lockfiles.getMarkDir().startsWith(home)).toBe(true);
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

const servers: Server[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const child of children.splice(0)) child.kill();
  for (const lockfile of lockfiles.readAllLockfiles()) lockfiles.removeLockfileForPort(lockfile.port);
});

/** An HTTP server that answers each request (`host.info` too) with this peer id. It gives its port. */
async function healthServer(peerId: string): Promise<number> {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ peerId }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  servers.push(server);
  const address = server.address();
  return typeof address === "object" && address ? address.port : 0;
}

/** A port that nothing listens on. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return typeof address === "object" && address ? address.port : 0;
}

/** The lockfile of a server on a port. The PID belongs to no process of the test. */
function lock(port: number, peerId: string, startedAt = new Date().toISOString(), pid = 999_999_999): void {
  lockfiles.writeLockfile({
    pid,
    port,
    transport: "http",
    endpoint: `http://127.0.0.1:${port}`,
    startedAt,
    peerId,
  });
}

async function run(procedure: AnyProcedure, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await procedure.handler!(input, {} as never)) as Record<string, unknown>;
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("server.status", () => {
  it("reports no server when there is no lockfile", async () => {
    expect(await run(status, {})).toEqual({ running: false, message: "No servers running" });
    expect(await run(status, { port: 4567 })).toEqual({ running: false, message: "No server found on port 4567" });
  });

  it("gives the details of one server that answers as its peer", async () => {
    const port = await healthServer("peer-a");
    lock(port, "peer-a", ago(30_000));
    const result = await run(status, { port });
    expect(result).toMatchObject({ running: true, port, pid: 999_999_999, transport: "http" });
    expect(result["uptime"]).toMatch(/^\d+s$/);
    expect(result["logFile"]).toBe(join(home, ".mark", "server.log"));
  });

  it("gives the uptime in minutes, hours and days", async () => {
    const port = await healthServer("peer-b");
    for (const [ms, pattern] of [
      [5 * 60_000 + 7_000, /^5m \d+s$/],
      [3 * 3_600_000 + 4 * 60_000, /^3h 4m$/],
      [2 * 86_400_000 + 5 * 3_600_000, /^2d 5h$/],
    ] as const) {
      lock(port, "peer-b", ago(ms));
      expect((await run(status, { port }))["uptime"]).toMatch(pattern);
    }
  });

  it("removes the lockfile of a server that does not answer", async () => {
    const port = await closedPort();
    lock(port, "peer-gone");
    expect(await run(status, {})).toEqual({ running: false, message: "Server is not running (cleaned up stale lockfile)" });
    expect(lockfiles.readLockfileForPort(port)).toBeNull();
  });

  it("summarizes more than one server, and removes the stale lockfiles", async () => {
    const one = await healthServer("peer-1");
    const two = await healthServer("peer-2");
    const gone = await closedPort();
    lock(one, "peer-1", ago(10_000));
    lock(two, "peer-2", ago(10_000));
    lock(gone, "peer-3");
    const result = await run(status, {});
    expect(result["running"]).toBe(true);
    expect(result["message"]).toMatch(/^2 server\(s\) running:/);
    expect(lockfiles.readLockfileForPort(gone)).toBeNull();
  });

  it("reports no server when each lockfile of several is stale", async () => {
    lock(await closedPort(), "peer-x");
    lock(await closedPort(), "peer-y");
    expect(await run(status, {})).toEqual({ running: false, message: "No servers running (cleaned up stale lockfiles)" });
  });
});

describe("server.stop", () => {
  it("reports no server when there is no lockfile", async () => {
    expect(await run(stop, {})).toEqual({ success: false, message: "No servers running" });
    expect(await run(stop, { port: 4568 })).toEqual({ success: false, message: "No server found on port 4568" });
  });

  it("removes a stale lockfile, and does not signal another process on the port", async () => {
    const gone = await closedPort();
    const other = await healthServer("someone-else");
    lock(gone, "peer-gone");
    lock(other, "peer-expected");
    const result = await run(stop, {});
    expect(result["success"]).toBe(true);
    expect(result["message"]).toContain(`Port ${gone}: cleaned up stale lockfile`);
    expect(result["message"]).toContain(`Port ${other}: another process answers on this port; nothing stopped`);
    expect(lockfiles.readAllLockfiles()).toEqual([]);
  });

  it("stops a server that answers as its peer, and removes its lockfile", async () => {
    const port = await closedPort();
    const code = [
      'const http = require("node:http");',
      'http.createServer((q, s) => { s.setHeader("content-type", "application/json"); s.end(JSON.stringify({ peerId: "peer-child" })); })',
      `  .listen(${port}, "127.0.0.1", () => console.log("ready"));`,
    ].join("\n");
    const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "inherit"] });
    children.push(child);
    await new Promise<void>((resolve) => child.stdout!.once("data", () => resolve()));
    lock(port, "peer-child", new Date().toISOString(), child.pid!);

    const result = await run(stop, { port, force: true });
    expect(result).toEqual({ success: true, message: `Port ${port}: stopped (PID ${child.pid})` });
    expect(lockfiles.readLockfileForPort(port)).toBeNull();
  }, 20_000);
});

describe("server.start", () => {
  it("refuses a port where a server of a lockfile answers", async () => {
    const port = await healthServer("peer-running");
    lock(port, "peer-running");
    expect(await run(start, { port })).toEqual({
      success: false,
      message: `Server already running on port ${port} (PID 999999999)`,
    });
  });

  it("reports a failure when the CLI process ends before it writes its lockfile", async () => {
    // The CLI of this test ends at once. server.start takes the running script as the CLI when
    // its name ends in cli.js.
    const folder = mkdtempSync(join(tmpdir(), "server-start-cli-"));
    const cli = join(folder, "cli.js");
    writeFileSync(cli, "process.exit(1);\n");
    const script = process.argv[1];
    process.argv[1] = cli;
    try {
      const port = await closedPort();
      const result = await run(start, { port, transport: "websocket" });
      expect(result).toEqual({
        success: false,
        message: `Failed to start server. Check ${join(home, ".mark", "server.log")} for details.`,
      });
      expect(lockfiles.readLockfileForPort(port)).toBeNull();
    } finally {
      process.argv[1] = script!;
      rmSync(folder, { recursive: true, force: true });
    }
  }, 20_000);
});
