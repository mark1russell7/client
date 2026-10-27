/**
 * The start of a background `mark --server` (CLI-27): `spawnMarkServer()`, the start of
 * `server.start` and of the auto-warm of `mark`.
 *
 * - The command line has the options of the server, `--fs-root` before `--server`, and
 *   `--idle-timeout` when the caller gives an idle stop.
 * - The process is detached and unref'd, and it has a listener of the event `error`.
 * - The tests give a fake spawner: no test starts a process.
 *
 * The module reads the home folder when it loads, so this file sets HOME (and USERPROFILE on
 * Windows) before it imports the module under test.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess, SpawnOptions } from "node:child_process";

const home = mkdtempSync(join(tmpdir(), "server-spawn-home-"));
const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] };
process.env["HOME"] = home;
process.env["USERPROFILE"] = home;

type Start = typeof import("./server.start.js");
let start: Start;

beforeAll(async () => {
  start = await import("./server.start.js");
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

/** A fake spawner: it keeps each call, and gives a fake process that counts its unref. */
function fakeSpawner() {
  const calls: { command: string; args: readonly string[]; options: SpawnOptions }[] = [];
  const state = { unrefs: 0 };
  const spawner = (command: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
    calls.push({ command, args, options });
    const child = Object.assign(new EventEmitter(), { pid: 4242, unref: () => void state.unrefs++ });
    return child as unknown as ChildProcess;
  };
  return { calls, state, spawner };
}

describe("spawnMarkServer (CLI-27)", () => {
  it("starts a detached, unref'd mark --server with the options of the server", () => {
    const { calls, state, spawner } = fakeSpawner();
    const spawned = start.spawnMarkServer({ port: 3100, host: "127.0.0.1", idleTimeoutMs: 600_000, fsRoot: "/work/root", spawner });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.args.slice(-9)).toEqual(["--fs-root", "/work/root", "--server", "--port", "3100", "--host", "127.0.0.1", "--idle-timeout", "600000"]);
    expect(call!.options).toMatchObject({ detached: true, windowsHide: true, cwd: process.cwd() });
    expect(state.unrefs).toBe(1);
    // An error of the spawn has a listener, so it does not end the process of the caller
    expect(spawned.child.listenerCount("error")).toBeGreaterThan(0);
    expect(() => spawned.child.emit("error", new Error("spawn mark ENOENT"))).not.toThrow();
    expect(spawned.args).toEqual(call!.args);
    expect(existsSync(spawned.logFile)).toBe(true);
    expect(spawned.logFile.startsWith(home)).toBe(true);
  });

  it("gives no --idle-timeout and no --fs-root without them, and the transport when it is not http", () => {
    const { calls, spawner } = fakeSpawner();
    start.spawnMarkServer({ port: 3101, host: "127.0.0.1", transport: "both", spawner });
    const args = calls[0]!.args;
    expect(args).not.toContain("--idle-timeout");
    expect(args).not.toContain("--fs-root");
    expect(args.slice(-7)).toEqual(["--server", "--port", "3101", "--host", "127.0.0.1", "--transport", "both"]);
  });
});
