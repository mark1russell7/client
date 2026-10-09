/**
 * The registry of long-running processes (deep dive WRP-4, WRP-10): a process that a procedure
 * starts and leaves running has a record, a stop and an end when the host ends.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { ProcessRegistry } from "./index.js";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("ProcessRegistry", () => {
  it("lists a running process, stops its tree and keeps the exit", async () => {
    const registry = new ProcessRegistry();
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: process.platform === 'win32' });",
      "console.log('grandchild ' + child.pid);",
      "setInterval(() => {}, 1000);",
    ].join("");
    const started = registry.start(process.execPath, { args: ["-e", script], group: "test", label: "sleeper" });
    const ready = await registry.waitFor(started.id, /grandchild (\d+)/, 10_000);
    const grandchild = Number(ready[1]);

    expect(registry.list({ group: "test" })).toEqual([
      expect.objectContaining({ id: started.id, status: "running", label: "sleeper", pid: started.pid }),
    ]);
    expect(registry.list({ group: "other" })).toEqual([]);

    const stopped = await registry.stop(started.id);
    expect(stopped.stopped).toBe(true);
    expect(registry.get(started.id)?.status).toBe("exited");
    const end = Date.now() + 5000;
    while (alive(grandchild) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alive(grandchild)).toBe(false);
  }, 20_000);

  it("keeps the end of the output of a process", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", "for (let i = 0; i < 5000; i++) console.log('row ' + i)"] });
    await registry.exited(started.id);
    const output = registry.output(started.id);
    expect(output.endsWith("row 4999\n")).toBe(true);
    expect(output.length).toBeLessThanOrEqual(64 * 1024);
    expect(registry.get(started.id)).toMatchObject({ status: "exited", exitCode: 0 });
  }, 20_000);

  it("removes old exit records (reaping)", async () => {
    const registry = new ProcessRegistry({ keepExited: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const started = registry.start(process.execPath, { args: ["-e", ""] });
      await registry.exited(started.id);
      ids.push(started.id);
    }
    expect(registry.list().map((info) => info.id)).toEqual(ids.slice(2));
  }, 20_000);

  it("rejects the wait when the process ends before the pattern appears", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", "console.log('bye')"] });
    await expect(registry.waitFor(started.id, /never/, 10_000)).rejects.toThrow(/exited/);
  }, 20_000);

  it("stops every process of the registry when the host ends", async () => {
    // A host process that starts a sleeper through the registry, prints its pid, then exits.
    // The host imports the build output, so this test needs `pnpm build` first.
    const host = [
      `import { processes } from ${JSON.stringify(new URL("../../dist/command/index.js", import.meta.url).href)};`,
      "const started = processes.start(process.execPath, { args: ['-e', 'setInterval(() => {}, 1000)'] });",
      "console.log(started.pid);",
      "setTimeout(() => process.exit(0), 300);",
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "-e", host], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let text = "";
    child.stdout.on("data", (chunk: Buffer) => (text += chunk.toString()));
    await new Promise((resolve) => child.on("close", resolve));
    const sleeper = Number(text.trim());
    expect(sleeper).toBeGreaterThan(0);
    const end = Date.now() + 5000;
    while (alive(sleeper) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alive(sleeper)).toBe(false);
  }, 20_000);
});
