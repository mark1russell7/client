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

describe("server.start (CLI-9: it waits for the readiness of the server)", () => {
  /** The PIDs of the fake CLI processes that a test started. Each one stops after the test. */
  const started: number[] = [];
  afterEach(() => {
    for (const pid of started.splice(0)) {
      try {
        process.kill(pid);
      } catch {
        // The process ended before
      }
    }
  });

  /**
   * A fake CLI in a temporary folder. It writes the lockfile of its `--port`, as `mark --server`
   * does, and then it acts as `mode` says:
   * - `ready`: its probe answers 503 for `readyAfterMs`, then 200. `host.info` answers the token.
   * - `no-probes`: the listener has no probes (404), as a build of `mark` before CLI-9. `host.info` answers.
   * - `never-ready`: its probe answers 503 for each read.
   * - `no-listener`: it writes the lockfile and listens on nothing.
   */
  function fakeCli(mode: "ready" | "no-probes" | "never-ready" | "no-listener", readyAfterMs = 0): { cli: string; folder: string } {
    const folder = mkdtempSync(join(tmpdir(), "server-start-cli-"));
    const cli = join(folder, "cli.js");
    const source = [
      'const http = require("node:http");',
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      'const os = require("node:os");',
      "const argv = process.argv.slice(2);",
      'const port = Number(argv[argv.indexOf("--port") + 1]);',
      `const mode = ${JSON.stringify(mode)};`,
      'const token = "fake-token";',
      'const peerId = "peer-fake-" + process.pid;',
      'const dir = path.join(os.homedir(), ".mark", "servers");',
      "fs.mkdirSync(dir, { recursive: true });",
      'const endpoint = "http://127.0.0.1:" + port + "/api";',
      'const lockfile = { pid: process.pid, port, transport: "http", endpoint, startedAt: new Date().toISOString(), token, cwd: process.cwd(), build: "fake", peerId };',
      'fs.writeFileSync(path.join(dir, port + ".lock"), JSON.stringify(lockfile));',
      `const readyAt = Date.now() + ${readyAfterMs};`,
      "setInterval(() => undefined, 1000);",
      'if (mode !== "no-listener") {',
      "  http.createServer((req, res) => {",
      '    if (req.url === "/_probes/readiness") {',
      '      if (mode === "no-probes") { res.statusCode = 404; res.end(); return; }',
      '      const ready = mode === "ready" && Date.now() >= readyAt;',
      "      res.statusCode = ready ? 200 : 503;",
      '      res.end(JSON.stringify({ status: ready ? "pass" : "fail", probe: "readiness" }));',
      "      return;",
      "    }",
      '    if (req.url === "/api/host/info" && req.headers.authorization === "Bearer " + token) {',
      '      res.setHeader("content-type", "application/json");',
      "      res.end(JSON.stringify({ peerId }));",
      "      return;",
      "    }",
      "    res.statusCode = 401;",
      '    res.end("{}");',
      '  }).listen(port, "127.0.0.1");',
      "}",
      "",
    ];
    writeFileSync(cli, source.join("\n"));
    return { cli, folder };
  }

  /** This function starts `server.start` with a fake CLI: the procedure takes the running script as the CLI when its name ends in cli.js. */
  async function startWith(cli: string, input: Record<string, unknown>): Promise<{ result: Record<string, unknown>; elapsed: number }> {
    const script = process.argv[1];
    process.argv[1] = cli;
    const begin = Date.now();
    try {
      const result = await run(start, input);
      if (typeof result["pid"] === "number") started.push(result["pid"]);
      return { result, elapsed: Date.now() - begin };
    } finally {
      process.argv[1] = script!;
    }
  }

  it("refuses a port where a server of a lockfile answers", async () => {
    const port = await healthServer("peer-running");
    lock(port, "peer-running");
    expect(await run(start, { port })).toEqual({
      success: false,
      message: `Server already running on port ${port} (PID 999999999)`,
    });
  });

  it("stops the wait as soon as the CLI process exits, and gives its PID and its exit code", async () => {
    const folder = mkdtempSync(join(tmpdir(), "server-start-cli-"));
    const cli = join(folder, "cli.js");
    writeFileSync(cli, "process.exit(1);\n");
    try {
      const port = await closedPort();
      const { result, elapsed } = await startWith(cli, { port, transport: "websocket" });
      const log = join(home, ".mark", "server.log");
      expect(result).toEqual({
        success: false,
        pid: expect.any(Number),
        logFile: log,
        message: `The server process (PID ${String(result["pid"])}) exited with the code 1 before it was ready. Check ${log} for details.`,
      });
      expect(elapsed).toBeLessThan(10_000);
      expect(lockfiles.readLockfileForPort(port)).toBeNull();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 20_000);

  it("waits until the readiness probe answers 200 and host.info answers the token of the new lockfile", async () => {
    const { cli, folder } = fakeCli("ready", 800);
    try {
      const port = await closedPort();
      const { result, elapsed } = await startWith(cli, { port });
      expect(result).toMatchObject({ success: true, port, endpoint: `http://127.0.0.1:${port}/api`, logFile: join(home, ".mark", "server.log") });
      expect(result["message"]).toBe(`Server started (PID ${String(result["pid"])})`);
      // The PID is the PID of the new server, from its lockfile
      expect(result["pid"]).toBe(lockfiles.readLockfileForPort(port)?.pid);
      // The wait stops as soon as the server is ready, long before the timeout of 15 s
      expect(elapsed).toBeGreaterThanOrEqual(700);
      expect(elapsed).toBeLessThan(10_000);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 20_000);

  it("takes host.info alone when the listener has no probes (a build of mark before CLI-9)", async () => {
    const { cli, folder } = fakeCli("no-probes");
    try {
      const port = await closedPort();
      const { result } = await startWith(cli, { port });
      expect(result).toMatchObject({ success: true, port });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 20_000);

  it("gives success false with the PID at the timeout, while the process still starts", async () => {
    const { cli, folder } = fakeCli("never-ready");
    try {
      const port = await closedPort();
      const { result, elapsed } = await startWith(cli, { port, timeout: 1_000 });
      const log = join(home, ".mark", "server.log");
      expect(result).toEqual({
        success: false,
        pid: expect.any(Number),
        port,
        logFile: log,
        message: `The server is not ready after 1000 ms. Its process (PID ${String(result["pid"])}) still starts: check ${log}, and run 'mark server status' later.`,
      });
      expect(elapsed).toBeGreaterThanOrEqual(1_000);
      expect(elapsed).toBeLessThan(10_000);
      // The process still runs: the procedure does not stop it
      expect(() => process.kill(result["pid"] as number, 0)).not.toThrow();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 20_000);

  it("is not ready when another server answers the probe of the port: host.info must answer as the new lockfile", async () => {
    // Another server holds the port: its probe answers 200, and its host.info gives another peer id
    const port = await healthServer("peer-other");
    const { cli, folder } = fakeCli("no-listener");
    try {
      const { result } = await startWith(cli, { port, timeout: 1_000 });
      expect(result).toMatchObject({ success: false, port, pid: expect.any(Number) });
      expect(result["message"]).toContain("is not ready after 1000 ms");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 20_000);

  it("reads the probe that a real host answers: readinessUrl() is the readiness probe of its listener", async () => {
    const { runProcedureHost } = await import("../host.js");
    const { readinessUrl } = await import("./server.start.js");
    const { LOCAL_LISTENER_KNOBS } = await import("@procedures/peer");
    const { createRegistry, hostPolicy } = await import("@procedures/client");
    const { fakeProcess } = await import("@mark1russell7/service/testing");
    const port = await closedPort();
    const running = await runProcedureHost({
      name: "mark-server",
      mode: "background",
      host: { registry: createRegistry(), policy: hostPolicy({ token: "t" }), listen: [{ port, knobs: LOCAL_LISTENER_KNOBS }] },
      run: { process: fakeProcess() },
    });
    try {
      expect(running.probes()).toEqual([`http://127.0.0.1:${port}/_probes`]);
      const answer = await fetch(readinessUrl("127.0.0.1", port));
      expect(answer.status).toBe(200);
      expect(await answer.json()).toMatchObject({ status: "pass", probe: "readiness" });
      // An address of all interfaces reads the probe on loopback
      expect(readinessUrl("0.0.0.0", port)).toBe(`http://127.0.0.1:${port}/_probes/readiness`);
      expect(readinessUrl("::", port)).toBe(`http://[::1]:${port}/_probes/readiness`);
    } finally {
      await running.life.shutdown("the test ended");
      await running.life.done;
    }
  }, 20_000);

  it("validates the timeout", async () => {
    const input = (await import("../schemas.js")).serverStartInputSchema;
    expect(input.parse({ timeout: 30_000 })).toEqual({ timeout: 30_000 });
    expect(() => input.parse({ timeout: 0 })).toThrow();
    expect(() => input.parse({ timeout: 1.5 })).toThrow();
  });
});
