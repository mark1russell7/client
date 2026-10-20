/**
 * E2E: the cold mode of the built CLI runs under `run()` of `@mark1russell7/service` (CLI-26).
 *
 * A real SIGINT stops a stream of a command in this process through the drain of the runner. The
 * runner ends the process with the exit code of a cold command. Windows cannot send a SIGINT that
 * a child process can catch, thus the test runs on the other platforms (the CI runs it on Linux).
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BIN } from "./run.js";

describe("mark: the cold mode under run() (CLI-26)", () => {
  it.skipIf(process.platform === "win32")("stops a cold stream at SIGINT through the drain, and exits with the code of the runner", async () => {
    const folder = mkdtempSync(join(tmpdir(), "mark-cold-"));
    const home = mkdtempSync(join(tmpdir(), "mark-cold-home-"));
    const child = spawn(process.execPath, [BIN, "--local", "--format", "json", "fs", "watch", folder], {
      env: { ...process.env, HOME: home, USERPROFILE: home, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });
    try {
      // Change the folder until the first change prints: then the stream runs under the runner
      const deadline = Date.now() + 60000;
      for (let n = 0; !stdout.includes('"event"'); n++) {
        if (Date.now() > deadline || child.exitCode !== null) throw new Error(`No first change within 60 s:\n${stdout}\n${stderr}`);
        writeFileSync(join(folder, `file-${n}.txt`), "x");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const sent = Date.now();
      child.kill("SIGINT");
      const { code, signal } = await exited;
      // The runner ends the process: no death by the signal, and the exit code 130 of the profile
      // ephemeral (before CLI-26, a cold command gave 1 after a first Ctrl-C)
      expect(signal, stderr).toBeNull();
      expect(code, stderr).toBe(130);
      expect(Date.now() - sent).toBeLessThan(10000);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      rmSync(folder, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  }, 90000);
});
