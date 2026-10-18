/**
 * The runner entry of the procedures host (CLI-8): `runProcedureHost()` and `runServer()` under
 * `run()` of `@mark1russell7/service`.
 *
 * - The lockfile is a dependency: the startup writes it, and the shutdown removes it.
 * - The foreground run has the profile `localDev`, where a second signal exits at once. The
 *   background host has the profile `daemon`, where a repeat signal has no effect (D6).
 * - `runServer()` installs no signal handler: a signal of the process port starts the stop in
 *   stages, and the promise ends with the lifecycle.
 *
 * The lockfile module reads the home folder when it loads, so this file sets HOME (and
 * USERPROFILE on Windows) before it imports the modules under test.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeProcess } from "@mark1russell7/service/testing";
import type { Lifecycle } from "@mark1russell7/service";
import { createRegistry, hostPolicy } from "@procedures/client";

const home = mkdtempSync(join(tmpdir(), "server-host-home-"));
const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] };
process.env["HOME"] = home;
process.env["USERPROFILE"] = home;

type Lockfiles = typeof import("@procedures/peer/lockfile");
type Host = typeof import("./host.js");
type Run = typeof import("./run.js");
type Peer = typeof import("@procedures/peer");
let lockfiles: Lockfiles;
let host: Host;
let run: Run;
let peer: Peer;

beforeAll(async () => {
  lockfiles = await import("@procedures/peer/lockfile");
  host = await import("./host.js");
  run = await import("./run.js");
  peer = await import("@procedures/peer");
  expect(lockfiles.getMarkDir().startsWith(home)).toBe(true);
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** The options of a host with one listener on a free port, and its token. */
function hostOptions(id: string) {
  return {
    id,
    registry: createRegistry(),
    policy: hostPolicy({ token: "host-token" }),
    listen: [{ port: 0, knobs: peer.LOCAL_LISTENER_KNOBS }],
  };
}

describe("runProcedureHost (CLI-8)", () => {
  it("writes the lockfile at the startup and removes it at the shutdown", async () => {
    const process = fakeProcess();
    const lockfile = {
      pid: 1,
      port: 40001,
      transport: "http",
      endpoint: "http://127.0.0.1:40001/api",
      startedAt: new Date().toISOString(),
      token: "host-token",
      cwd: "/work",
      build: "build-1",
      peerId: "peer-lockfile",
    };
    const running = await host.runProcedureHost({ name: "lockfile", mode: "background", host: hostOptions("peer-lockfile"), lockfile, run: { process } });
    lives.push(running.life);
    expect(running.life.state).toBe("running");
    expect(lockfiles.readLockfileForPort(40001)?.peerId).toBe("peer-lockfile");
    // host.info answers the token of the lockfile with the peer id
    const [endpoint] = running.host.info.endpoints();
    const info = await fetch(`${endpoint!.address}/host/info`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer host-token" },
      body: "{}",
    });
    expect(((await info.json()) as { peerId: string }).peerId).toBe("peer-lockfile");

    await running.life.shutdown("the test stops the host");
    expect(await running.life.done).toBe(0);
    lives.splice(0);
    expect(lockfiles.readLockfileForPort(40001)).toBeNull();
    expect(process.exits).toEqual([0]);
  }, 20000);

  it("declares the profile of each mode: an exit at a second signal in the foreground, no effect in the background", async () => {
    const foreground = await host.runProcedureHost({ name: "fg", mode: "foreground", host: hostOptions("peer-fg"), run: { process: fakeProcess() } });
    lives.push(foreground.life);
    const background = await host.runProcedureHost({ name: "bg", mode: "background", host: hostOptions("peer-bg"), run: { process: fakeProcess() } });
    lives.push(background.life);
    expect(foreground.service.describe().shutdown.onRepeatSignal).toBe("exit");
    expect(background.service.describe().shutdown.onRepeatSignal).toBe("ignore");
    // The caps of the stages sum to 10 s: they replace the hard-exit timer of 10 s
    const caps = foreground.service.describe().shutdown.phases.reduce((sum, phase) => sum + phase.cap.value * (phase.cap.unit === "ms" ? 0.001 : 1), 0);
    expect(caps).toBeLessThanOrEqual(10);
  }, 20000);
});

describe("runServer (CLI-8)", () => {
  it("installs no signal handler: a signal of the process port stops the server in stages", async () => {
    const port = await freePort();
    const signals = { SIGINT: globalThis.process.listenerCount("SIGINT"), SIGTERM: globalThis.process.listenerCount("SIGTERM") };
    const process = fakeProcess();
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(" "));
    let ended = false;
    try {
      const running = run.runServer(["--port", String(port), "--token", "t", "--transport", "http"], { run: { process } }).then(() => {
        ended = true;
      });
      const until = Date.now() + 15000;
      while (!lines.some((line) => line.includes("Press Ctrl+C")) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(lines.some((line) => line.includes("Press Ctrl+C"))).toBe(true);
      expect(globalThis.process.listenerCount("SIGINT")).toBe(signals.SIGINT);
      expect(globalThis.process.listenerCount("SIGTERM")).toBe(signals.SIGTERM);
      expect(ended).toBe(false);
      process.signal("SIGINT");
      await running;
      expect(process.exits).toEqual([0]);
      expect(lines.some((line) => line.includes("Shutting down"))).toBe(true);
    } finally {
      console.log = log;
    }
  }, 30000);
});
