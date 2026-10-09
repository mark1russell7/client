/**
 * node.run and the managed processes of node.spawn (deep dive WRP-4, WRP-10, roadmap 2.2):
 * - node.run has an output limit, and its timeout kills the whole process tree;
 * - node.kill kills the whole tree of a spawned process;
 * - a spawned process that writes much output does not stop on a full pipe.
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeRun } from "./procedures/node/run.js";
import { nodeSpawn } from "./procedures/node/spawn.js";
import { nodeKill } from "./procedures/node/kill.js";
import { nodeStatus } from "./procedures/node/status.js";

const dir = mkdtempSync(join(tmpdir(), "client-node-"));

function script(name: string, source: string): string {
  const path = join(dir, name);
  writeFileSync(path, source);
  return path;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gone(pid: number): Promise<boolean> {
  expect(pid).toBeGreaterThan(0);
  const end = Date.now() + 5000;
  while (alive(pid) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
  return !alive(pid);
}

// On Windows, Node puts a child in a job object that ends it with its parent. A program such as
// cmd.exe does not, so the grandchild starts detached (outside the job) to show that case.
const PARENT_OF_SLEEPER = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: process.platform === 'win32' });",
  "console.log('ready ' + child.pid);",
  "setInterval(() => {}, 1000);",
].join("\n");

describe("node.run", () => {
  it("keeps at most maxOutputBytes of the output", async () => {
    const path = script("loud.cjs", "for (let i = 0; i < 10000; i++) console.log('line ' + i)");
    const result = await nodeRun({ script: path, maxOutputBytes: 1000 });
    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1000);
  });

  it("kills the whole process tree at the timeout", async () => {
    const path = script("parent.cjs", PARENT_OF_SLEEPER);
    let message = "";
    try {
      await nodeRun({ script: path, timeout: 1500 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/timed out after 1500ms/);
    const grandchild = Number(/ready (\d+)/.exec(message)?.[1]);
    expect(await gone(grandchild)).toBe(true);
  }, 20_000);
});

describe("node.spawn, node.status and node.kill", () => {
  it("kill the whole tree of a spawned process", async () => {
    const path = script("server.cjs", PARENT_OF_SLEEPER);
    const spawned = await nodeSpawn({ script: path, ready: { pattern: "ready \\d+", timeout: 10_000 } });
    const status = await nodeStatus({ processId: spawned.processId, output: true });
    expect(status.processes).toEqual([expect.objectContaining({ processId: spawned.processId, status: "running" })]);
    const grandchild = Number(/ready (\d+)/.exec(status.processes[0]?.output ?? "")?.[1]);

    const killed = await nodeKill({ processId: spawned.processId });
    expect(killed.success).toBe(true);
    expect(await gone(spawned.pid)).toBe(true);
    expect(await gone(grandchild)).toBe(true);
    expect((await nodeStatus({ processId: spawned.processId })).processes[0]?.status).toBe("exited");
  }, 20_000);

  it("read the output of a spawned process, so a full pipe does not stop it", async () => {
    const marker = join(dir, "spoke");
    const path = script(
      "loud-server.cjs",
      `process.stdout.write('x'.repeat(4 * 1024 * 1024), () => require('node:fs').writeFileSync(${JSON.stringify(marker)}, ''));\nsetInterval(() => {}, 1000);`,
    );
    const spawned = await nodeSpawn({ script: path });
    const end = Date.now() + 10_000;
    while (!existsSync(marker) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(existsSync(marker)).toBe(true);
    await nodeKill({ processId: spawned.processId });
  }, 20_000);
});
