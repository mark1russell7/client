/**
 * The auto-warm of `mark` (CLI-27): start the background host after a cold command.
 *
 * - The decision: the setting, a warm host of this folder, a start claim of another command and a
 *   port in use each stop the spawn.
 * - The steps run in sequence, and each path that does not start a host removes the claim.
 * - The start claim is one file per port: only one command gets it, and a stale claim goes.
 * - The lockfile module, `node:net` and the spawn are fakes. No test starts a process, opens a
 *   port or waits for real time.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, it, expect, vi } from "vitest";

const fake = vi.hoisted(() => ({
  dir: "",
  found: false,
  lockfile: null as { port: number } | null,
  state: "dead",
  /** The result of each connect: "connect", "error" or "timeout". */
  connect: "error" as "connect" | "error" | "timeout",
  connects: [] as Array<{ host: string; port: number }>,
}));

vi.mock("@procedures/peer/lockfile", () => ({
  getMarkDir: () => fake.dir,
  findServer: async () => (fake.found ? { port: 3000 } : null),
  readLockfileForPort: () => fake.lockfile,
  checkServer: async () => fake.state,
}));

vi.mock("node:net", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    connect: (options: { host: string; port: number }) => {
      fake.connects.push(options);
      const socket = Object.assign(new Emitter(), {
        destroyed: false,
        destroy() {
          socket.destroyed = true;
        },
        setTimeout(_ms: number, onTimeout: () => void) {
          if (fake.connect === "timeout") queueMicrotask(onTimeout);
        },
      });
      if (fake.connect === "connect") queueMicrotask(() => socket.emit("connect"));
      if (fake.connect === "error") queueMicrotask(() => socket.emit("error", new Error("connect ECONNREFUSED")));
      return socket;
    },
  };
});

fake.dir = mkdtempSync(join(tmpdir(), "mark-auto-warm-"));

const warm = await import("./auto-warm.js");

beforeEach(() => {
  fake.found = false;
  fake.lockfile = null;
  fake.state = "dead";
  fake.connect = "error";
  fake.connects = [];
  rmSync(fake.dir, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(fake.dir, { recursive: true, force: true });
});

describe("decideAutoWarm (CLI-27)", () => {
  const facts = { setting: "after-cold", warmHost: false, starting: false, portBusy: false } as const;

  it("starts a host only with after-cold, no warm host, no other start and a free port", () => {
    expect(warm.decideAutoWarm(facts)).toEqual({ spawn: true });
  });

  it("gives the first reason in sequence: the setting, the warm host, the other start, the port", () => {
    for (const setting of warm.AUTO_WARM_SETTINGS) {
      for (const warmHost of [false, true]) {
        for (const starting of [false, true]) {
          for (const portBusy of [false, true]) {
            const decision = warm.decideAutoWarm({ setting, warmHost, starting, portBusy });
            const reason =
              setting === "never"
                ? "MARK_AUTO_WARM is never"
                : warmHost
                  ? "a warm host runs"
                  : starting
                    ? "another command starts the host"
                    : portBusy
                      ? "the port is in use"
                      : undefined;
            expect(decision).toEqual(reason === undefined ? { spawn: true } : { spawn: false, reason });
          }
        }
      }
    }
  });
});

/** The fake steps of a test: each step goes in the log. */
function fakeSteps(given: { warmHost?: boolean; claim?: boolean; portBusy?: boolean; pid?: number | undefined; spawnThrows?: boolean } = {}) {
  const log: string[] = [];
  const steps: import("./auto-warm.js").AutoWarmSteps = {
    findWarmHost: async () => {
      log.push("find");
      return given.warmHost ?? false;
    },
    claimStart: () => {
      log.push("claim");
      return given.claim ?? true;
    },
    portBusy: async () => {
      log.push("port");
      return given.portBusy ?? false;
    },
    spawn: () => {
      log.push("spawn");
      if (given.spawnThrows) throw new Error("spawn failed");
      return "pid" in given ? given.pid : 4242;
    },
    recordStart: (pid) => void log.push(`record ${pid}`),
    releaseStart: () => void log.push("release"),
  };
  return { log, steps };
}

describe("autoWarm (CLI-27)", () => {
  it("does nothing with the setting never", async () => {
    const { log, steps } = fakeSteps();
    expect(await warm.autoWarm("never", steps)).toEqual({ spawn: false, reason: "MARK_AUTO_WARM is never" });
    expect(log).toEqual([]);
  });

  it("starts a host after the claim and the port check, and records its process ID", async () => {
    const { log, steps } = fakeSteps();
    expect(await warm.autoWarm("after-cold", steps)).toEqual({ spawn: true });
    expect(log).toEqual(["find", "claim", "port", "spawn", "record 4242"]);
  });

  it("starts no host when a warm host runs, and takes no claim", async () => {
    const { log, steps } = fakeSteps({ warmHost: true });
    expect(await warm.autoWarm("after-cold", steps)).toEqual({ spawn: false, reason: "a warm host runs" });
    expect(log).toEqual(["find"]);
  });

  it("starts no host when another command has the claim", async () => {
    const { log, steps } = fakeSteps({ claim: false });
    expect(await warm.autoWarm("after-cold", steps)).toEqual({ spawn: false, reason: "another command starts the host" });
    expect(log).toEqual(["find", "claim"]);
  });

  it("removes the claim when the port is in use, when no process starts and when a step throws", async () => {
    const busy = fakeSteps({ portBusy: true });
    expect(await warm.autoWarm("after-cold", busy.steps)).toEqual({ spawn: false, reason: "the port is in use" });
    expect(busy.log).toEqual(["find", "claim", "port", "release"]);

    const none = fakeSteps({ pid: undefined });
    expect(await warm.autoWarm("after-cold", none.steps)).toEqual({ spawn: false, reason: "the host process did not start" });
    expect(none.log).toEqual(["find", "claim", "port", "spawn", "release"]);

    const throws = fakeSteps({ spawnThrows: true });
    await expect(warm.autoWarm("after-cold", throws.steps)).rejects.toThrow("spawn failed");
    expect(throws.log).toEqual(["find", "claim", "port", "spawn", "release"]);
  });
});

describe("autoWarmConfig and parseIdleTimeout (CLI-27)", () => {
  it("gives the defaults without the variables: never, 10 minutes, port 3000 on loopback", () => {
    expect(warm.autoWarmConfig({})).toEqual({ setting: "never", idleTimeoutMs: 600_000, port: 3000, host: "127.0.0.1" });
    expect(warm.autoWarmConfig({ MARK_AUTO_WARM: " ", MARK_IDLE_TIMEOUT_MS: "", MARK_AUTO_WARM_PORT: "" }).setting).toBe("never");
  });

  it("reads the setting, the idle stop and the port", () => {
    expect(warm.autoWarmConfig({ MARK_AUTO_WARM: "after-cold", MARK_IDLE_TIMEOUT_MS: "1500", MARK_AUTO_WARM_PORT: "3100" })).toEqual({
      setting: "after-cold",
      idleTimeoutMs: 1500,
      port: 3100,
      host: "127.0.0.1",
    });
  });

  it("refuses an invalid value, and the error names the variable", () => {
    expect(() => warm.autoWarmConfig({ MARK_AUTO_WARM: "always" })).toThrow(/MARK_AUTO_WARM.*never, after-cold/);
    expect(() => warm.autoWarmConfig({ MARK_IDLE_TIMEOUT_MS: "0" })).toThrow(/MARK_IDLE_TIMEOUT_MS/);
    for (const port of ["0", "65536", "30x", "-1"]) {
      expect(() => warm.autoWarmConfig({ MARK_AUTO_WARM_PORT: port })).toThrow(/MARK_AUTO_WARM_PORT/);
    }
  });

  it("reads a whole number of 1 or more milliseconds", () => {
    expect(warm.parseIdleTimeout("250")).toBe(250);
    expect(warm.parseIdleTimeout(" 60000 ")).toBe(60_000);
    for (const value of ["0", "-5", "1.5", "abc", "", "1e3"]) {
      expect(() => warm.parseIdleTimeout(value)).toThrow(/--idle-timeout/);
    }
  });
});

describe("startClaim (CLI-27)", () => {
  /** The claim of a test, in the temporary folder, with a clock and a process table of the test. */
  function claimOf(port: number, options: { now?: () => number; alive?: (pid: number) => boolean } = {}) {
    return warm.startClaim(port, { dir: fake.dir, maxAgeMs: 60_000, ...options });
  }
  const file = (port: number): string => join(fake.dir, `auto-warm-${port}.claim`);

  it("gives the claim to one command only, until the release", () => {
    const first = claimOf(3000);
    const second = claimOf(3000);
    expect(first.claimStart()).toBe(true);
    expect(second.claimStart()).toBe(false);
    // The release of a command without the claim removes nothing
    second.releaseStart();
    expect(existsSync(file(3000))).toBe(true);
    first.releaseStart();
    expect(existsSync(file(3000))).toBe(false);
    expect(second.claimStart()).toBe(true);
  });

  it("records the process ID of the host in the claim", () => {
    const claim = claimOf(3001, { now: () => 5 });
    expect(claim.claimStart()).toBe(true);
    claim.recordStart(777);
    expect(JSON.parse(readFileSync(file(3001), "utf8"))).toEqual({ at: 5, pid: 777 });
  });

  it("removes a stale claim: too old, of a process that ended, or not JSON", () => {
    let now = 0;
    const old = claimOf(3002, { now: () => now });
    expect(old.claimStart()).toBe(true);
    now = 59_999;
    expect(claimOf(3002, { now: () => now }).claimStart()).toBe(false);
    now = 60_000;
    expect(claimOf(3002, { now: () => now }).claimStart()).toBe(true);

    const host = claimOf(3003, { now: () => 0 });
    expect(host.claimStart()).toBe(true);
    host.recordStart(999);
    expect(claimOf(3003, { now: () => 1, alive: () => true }).claimStart()).toBe(false);
    expect(claimOf(3003, { now: () => 1, alive: (pid) => pid !== 999 }).claimStart()).toBe(true);

    writeFileSync(file(3004), "not json");
    expect(claimOf(3004).claimStart()).toBe(true);
  });
});

describe("portAnswers (CLI-27)", () => {
  it("tells if something accepts a connection on the port", async () => {
    fake.connect = "connect";
    expect(await warm.portAnswers("127.0.0.1", 3000)).toBe(true);
    fake.connect = "error";
    expect(await warm.portAnswers("127.0.0.1", 3000)).toBe(false);
    fake.connect = "timeout";
    expect(await warm.portAnswers("127.0.0.1", 3000, 10)).toBe(false);
    expect(fake.connects).toEqual([
      { host: "127.0.0.1", port: 3000 },
      { host: "127.0.0.1", port: 3000 },
      { host: "127.0.0.1", port: 3000 },
    ]);
  });
});

describe("autoWarmSteps (CLI-27)", () => {
  const config = { setting: "after-cold", idleTimeoutMs: 1500, port: 3100, host: "127.0.0.1" } as const;

  it("finds a warm host with the lockfiles of this folder", async () => {
    const steps = warm.autoWarmSteps(config, { cwd: "/work", build: "b1" }, () => ({ pid: 1 }));
    expect(await steps.findWarmHost()).toBe(false);
    fake.found = true;
    expect(await steps.findWarmHost()).toBe(true);
  });

  it("sees the port in use by a live server of a lockfile, or by another program", async () => {
    const steps = warm.autoWarmSteps(config, { cwd: "/work", build: "b1" }, () => ({ pid: 1 }));
    expect(await steps.portBusy()).toBe(false);
    fake.lockfile = { port: 3100 };
    fake.state = "running";
    expect(await steps.portBusy()).toBe(true);
    // A dead server of a lockfile: the port check decides
    fake.state = "dead";
    fake.connect = "connect";
    expect(await steps.portBusy()).toBe(true);
  });

  it("starts the host with the port, the address, the idle stop and the root", () => {
    const spawns: unknown[] = [];
    const spawnHost = (options: unknown) => {
      spawns.push(options);
      return Object.assign(new EventEmitter(), { pid: 4242 });
    };
    expect(warm.autoWarmSteps(config, { cwd: "/work", build: "b1", fsRoot: "/work/root" }, spawnHost).spawn()).toBe(4242);
    expect(warm.autoWarmSteps(config, { cwd: "/work", build: "b1" }, spawnHost).spawn()).toBe(4242);
    expect(spawns).toEqual([
      { port: 3100, host: "127.0.0.1", idleTimeoutMs: 1500, fsRoot: "/work/root" },
      { port: 3100, host: "127.0.0.1", idleTimeoutMs: 1500 },
    ]);
  });

  it("claims the start in the folder of mark", () => {
    const steps = warm.autoWarmSteps(config, { cwd: "/work", build: "b1" }, () => ({ pid: 1 }));
    expect(steps.claimStart()).toBe(true);
    expect(existsSync(join(fake.dir, "auto-warm-3100.claim"))).toBe(true);
    steps.releaseStart();
    expect(existsSync(join(fake.dir, "auto-warm-3100.claim"))).toBe(false);
  });
});
