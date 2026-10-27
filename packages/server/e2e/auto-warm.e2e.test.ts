/**
 * The auto-warm of `mark` (CLI-27). A cold command starts the background host, and the next command
 * uses it. The host stops by itself after the idle time.
 *
 * - The first command runs cold with `MARK_AUTO_WARM=after-cold`. Before it exits, it starts
 *   `mark --server --idle-timeout <ms>` as a detached process on the port of the test.
 * - The second command finds the warm host: `host.metrics` of the host counts its call.
 * - With no more calls, the host stops through the stop request of its lifecycle: its lockfile
 *   goes, and its process ends.
 *
 * The test starts processes and waits for real time. Thus only the CI job `lifecycle` starts it
 * (`vitest.e2e.config.ts`), on Linux. It needs the build of `@procedures/mark`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The bin of `mark`, from the workspace. `@procedures/mark` depends on this package, not the reverse. */
const MARK_BIN = fileURLToPath(new URL("../../mark/dist/bin.js", import.meta.url));
/** The idle time of the host of the test. It is long enough for the second command on a slow runner. */
const IDLE_MS = 8_000;

const run = promisify(execFile);
const folders: string[] = [];
const pids: number[] = [];

afterEach(() => {
  // A host that a failed test left
  for (const pid of pids.splice(0)) {
    if (alive(pid)) process.kill(pid, "SIGKILL");
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
});

/** True when a process runs. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A free port of the loopback interface. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** This function waits until `ready` gives true: it asks again each 50 ms, until `ms`. */
async function until(ready: () => boolean | Promise<boolean>, ms: number, what: string): Promise<void> {
  const end = performance.now() + ms;
  while (!(await ready())) {
    if (performance.now() > end) throw new Error(`${what}: not within ${ms} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The lockfile of the host of the test. */
interface Lock {
  readonly pid: number;
  readonly endpoint: string;
  readonly token: string;
}

/** This function calls a host procedure of the host over HTTP with the token of the lockfile. */
async function hostCall(lock: Lock, name: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${lock.endpoint}/host/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${lock.token}` },
    body: "{}",
  });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

describe("the auto-warm of mark (CLI-27)", () => {
  it("starts the host after a cold command: the next command is warm, and the idle host stops by itself", async () => {
    const home = mkdtempSync(join(tmpdir(), "auto-warm-"));
    folders.push(home);
    writeFileSync(join(home, "hello.txt"), "hello");
    const port = await freePort();
    const env = {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      HOME: home,
      USERPROFILE: home,
      MARK_AUTO_WARM: "after-cold",
      MARK_AUTO_WARM_PORT: String(port),
      MARK_IDLE_TIMEOUT_MS: String(IDLE_MS),
    };
    const lockPath = join(home, ".mark", "servers", `${port}.lock`);
    const logPath = join(home, ".mark", "server.log");
    const mark = (args: readonly string[]) => run(process.execPath, [MARK_BIN, ...args], { cwd: home, env, timeout: 120_000 });
    try {
      // The first command: no host runs, so it runs cold, and it starts the host before it exits
      const first = await mark(["fs", "read", "hello.txt"]);
      expect(first.stdout).toContain("hello");
      await until(() => existsSync(lockPath), 90_000, "the lockfile of the host");
      const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Lock;
      pids.push(lock.pid);
      await until(async () => (await hostCall(lock, "info").catch(() => ({ status: 0 }))).status === 200, 90_000, "the readiness of the host");

      // The second command: the warm host takes it
      const second = await mark(["fs", "read", "hello.txt"]);
      expect(second.stdout).toContain("hello");
      const metrics = await hostCall(lock, "metrics");
      expect(metrics.status).toBe(200);
      expect((metrics.body as { procedures: Record<string, { calls: number }> }).procedures["fs.read"]?.calls).toBe(1);

      // No more calls: the host stops by itself, removes its lockfile and exits
      await until(() => !existsSync(lockPath) && !alive(lock.pid), IDLE_MS + 60_000, "the idle stop of the host");
      expect(readFileSync(logPath, "utf8")).toContain(`Idle: the host had no call for ${IDLE_MS} ms.`);
    } finally {
      if (existsSync(logPath)) console.log(`[auto-warm] the log of the host:\n${readFileSync(logPath, "utf8")}`);
    }
  });
});
