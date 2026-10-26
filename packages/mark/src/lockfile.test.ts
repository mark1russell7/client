/**
 * The lockfile helpers of mark: they use the shared lockfile module of `@procedures/peer`, which
 * is a fake here. The folder of mark is a new temporary folder.
 */

import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, it, expect, vi } from "vitest";

const fake = vi.hoisted(() => ({
  dir: "",
  lockfiles: [] as Array<{ port: number }>,
  states: new Map<number, string>(),
  removed: [] as number[],
  written: [] as unknown[],
}));

vi.mock("@procedures/peer/lockfile", () => ({
  getMarkDir: () => fake.dir,
  getServersDir: () => join(fake.dir, "servers"),
  readAllLockfiles: () => fake.lockfiles,
  checkServer: async (lockfile: { port: number }) => fake.states.get(lockfile.port) ?? "dead",
  removeLockfileForPort: (port: number) => {
    fake.removed.push(port);
  },
  writeLockfile: (data: unknown) => {
    fake.written.push(data);
  },
  findServer: async () => null,
  readLockfileForPort: () => null,
}));

fake.dir = mkdtempSync(join(tmpdir(), "mark-lockfile-"));

const lockfile = await import("./lockfile.js");

beforeEach(() => {
  fake.lockfiles = [];
  fake.states = new Map();
  fake.removed = [];
  fake.written = [];
});

afterAll(() => {
  rmSync(fake.dir, { recursive: true, force: true });
});

describe("the lockfile helpers of mark", () => {
  it("gives the first lockfile whose server answers, and removes the lockfile of a dead server", async () => {
    fake.lockfiles = [{ port: 1 }, { port: 2 }, { port: 3 }];
    fake.states = new Map([
      [1, "dead"],
      [2, "alive"],
    ]);
    expect(await lockfile.readLockfile()).toEqual({ port: 2 });
    expect(fake.removed).toEqual([1]);
  });

  it("gives null when no server answers", async () => {
    fake.lockfiles = [{ port: 4 }];
    fake.states = new Map([[4, "unknown"]]);
    expect(await lockfile.readLockfile()).toBeNull();
    expect(fake.removed).toEqual([]);
  });

  it("writes a lockfile with the shared module, and removes the one of port 3000", async () => {
    await lockfile.writeLockfile({ port: 9 } as never);
    await lockfile.removeLockfile();
    expect(fake.written).toEqual([{ port: 9 }]);
    expect(fake.removed).toEqual([3000]);
  });

  it("gives the folders and the log file in the folder of mark", () => {
    expect(lockfile.getLockfileDir()).toBe(fake.dir);
    expect(lockfile.getLockfilePath()).toBe(join(fake.dir, "servers"));
    expect(lockfile.getLogPath()).toBe(join(fake.dir, "server.log"));
  });

  it("gives the build: the file of the module and its time", () => {
    expect(lockfile.currentBuild()).toMatch(/lockfile\.ts@\d/);
  });

  it("moves the log file to server.log.1, and does nothing without a log file", async () => {
    await lockfile.rotateLogFile();
    expect(existsSync(join(fake.dir, "server.log.1"))).toBe(false);
    writeFileSync(join(fake.dir, "server.log"), "old");
    await lockfile.rotateLogFile();
    expect(existsSync(join(fake.dir, "server.log"))).toBe(false);
    expect(readFileSync(join(fake.dir, "server.log.1"), "utf8")).toBe("old");
  });
});
