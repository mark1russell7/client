/**
 * The shared lockfile module (deep dive CLI-3, CLI-4, CLI-14): a server counts only when its
 * `host.info` answers with the peer id of its lockfile, and a client uses only a server of
 * its own folder and build. The tests use a temporary home folder, never the real ~/.mark.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as Lockfile from "./lockfile.js";

const home = mkdtempSync(join(tmpdir(), "mark-home-"));
process.env["HOME"] = home;
process.env["USERPROFILE"] = home;

let lockfile: typeof Lockfile;
let health: Server;
let healthPort = 0;

beforeAll(async () => {
  lockfile = await import("./lockfile.js");
  // host.info of a peer: a POST with the token of the lockfile (CLI-7)
  health = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "POST" || req.url !== "/api/host/info") {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: "NOT_FOUND" }));
      return;
    }
    if (req.headers.authorization !== "Bearer t") {
      res.statusCode = 401;
      res.end(JSON.stringify({ code: "UNAUTHORIZED" }));
      return;
    }
    res.end(JSON.stringify({ peerId: "peer-live" }));
  });
  await new Promise<void>((resolve) => health.listen(0, "127.0.0.1", () => resolve()));
  const address = health.address();
  healthPort = typeof address === "object" && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => health.close(() => resolve()));
  rmSync(home, { recursive: true, force: true });
});

function lock(port: number, overrides: Partial<Lockfile.LockfileData> = {}): Lockfile.LockfileData {
  return {
    pid: process.pid,
    port,
    transport: "http",
    endpoint: `http://127.0.0.1:${port}/api`,
    startedAt: new Date().toISOString(),
    token: "t",
    cwd: "/work",
    build: "build-1",
    peerId: "peer-live",
    ...overrides,
  };
}

describe("lockfiles", () => {
  it("writes into the temporary home, not the real one", () => {
    lockfile.writeLockfile(lock(healthPort));
    expect(existsSync(join(home, ".mark", "servers", `${healthPort}.lock`))).toBe(true);
    lockfile.removeLockfileForPort(healthPort);
  });

  it("checkServer: alive only when host.info answers the lockfile's token with its peer id", async () => {
    expect(await lockfile.checkServer(lock(healthPort))).toBe("alive");
    expect(await lockfile.checkServer(lock(healthPort, { peerId: "another-peer" }))).toBe("other");
    expect(await lockfile.checkServer(lock(healthPort, { token: "wrong" }))).toBe("other");
    expect(await lockfile.checkServer(lock(1))).toBe("dead");
  });

  it("findServer: only a server of this folder and build, and it removes a dead server's lockfile", async () => {
    lockfile.writeLockfile(lock(healthPort));
    lockfile.writeLockfile(lock(1));
    expect((await lockfile.findServer({ cwd: "/work", build: "build-1" }))?.port).toBe(healthPort);
    expect(await lockfile.findServer({ cwd: "/elsewhere", build: "build-1" })).toBeNull();
    expect(await lockfile.findServer({ cwd: "/work", build: "build-2" })).toBeNull();
    expect(lockfile.readLockfileForPort(1)).toBeNull();
    lockfile.removeLockfileForPort(healthPort);
  });

  it("findServer: only a server with the same fs root, and a caller without a root only a server without one", async () => {
    lockfile.writeLockfile(lock(healthPort, { fsRoot: "/work/data" }));
    expect((await lockfile.findServer({ cwd: "/work", build: "build-1", fsRoot: "/work/data" }))?.port).toBe(healthPort);
    expect(await lockfile.findServer({ cwd: "/work", build: "build-1", fsRoot: "/work/other" })).toBeNull();
    expect(await lockfile.findServer({ cwd: "/work", build: "build-1" })).toBeNull();
    lockfile.writeLockfile(lock(healthPort));
    expect(await lockfile.findServer({ cwd: "/work", build: "build-1", fsRoot: "/work/data" })).toBeNull();
    expect((await lockfile.findServer({ cwd: "/work", build: "build-1" }))?.port).toBe(healthPort);
    lockfile.removeLockfileForPort(healthPort);
  });

  it("findServer: never a server without a token (a lockfile of an older version)", async () => {
    const { token: _token, ...withoutToken } = lock(healthPort);
    lockfile.writeLockfile(withoutToken);
    expect(await lockfile.findServer({ cwd: "/work", build: "build-1" })).toBeNull();
    lockfile.removeLockfileForPort(healthPort);
  });
});
