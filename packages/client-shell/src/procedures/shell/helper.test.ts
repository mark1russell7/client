/**
 * shell.run, shell.exec and shell.stream use the command helpers (roadmap 2.2): the timeout and
 * the signal kill the whole process tree (deep dive WRP-10), shell.exec writes its `stdin` input,
 * and shell.stream holds a fast program back while the reader is slow (deep dive WRP-9).
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "../../register.js";
import type { ShellRunOutput, ShellExecOutput, ShellStreamItem } from "../../types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

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

/**
 * A program that starts a grandchild that runs for ever, prints the grandchild's pid, then waits.
 * On Windows, Node puts a child in a job object that ends it with its parent. A program such as
 * cmd.exe does not, so the grandchild starts detached (outside the job) to show that case.
 */
const PARENT_OF_SLEEPER = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: process.platform === 'win32' });",
  "console.log(child.pid);",
  "setInterval(() => {}, 1000);",
].join("");

describe("shell.run", () => {
  it("kills the grandchildren at the timeout", async () => {
    const result = await client.call<unknown, ShellRunOutput>({ service: "shell", operation: "run" }, {
      command: process.execPath,
      args: ["-e", PARENT_OF_SLEEPER],
      timeout: 1500,
    });
    expect(result.success).toBe(false);
    expect(result.signal).toBe("SIGTERM");
    expect(await gone(Number(result.stdout.trim()))).toBe(true);
  }, 20_000);

  it("ends the command when the signal of the call aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1500);
    const started = Date.now();
    const result = await client.call<unknown, ShellRunOutput>(
      { service: "shell", operation: "run" },
      { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] },
      { signal: controller.signal },
    ).catch((error: unknown) => error);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result).toBeDefined();
  }, 20_000);
});

describe("shell.exec", () => {
  it("writes the stdin input to the command", async () => {
    const script = "let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => process.stdout.write('[' + s + ']'))";
    const result = await client.call<unknown, ShellExecOutput>({ service: "shell", operation: "exec" }, {
      command: `"${process.execPath}" -e "${script}"`,
      stdin: "piped",
      timeout: 10_000,
    });
    expect(result.stdout).toBe("[piped]");
    expect(result.success).toBe(true);
  }, 20_000);

  it("kills the grandchildren at the timeout", async () => {
    const result = await client.call<unknown, ShellExecOutput>({ service: "shell", operation: "exec" }, {
      // The script has no double quote and no "$", so both cmd.exe and sh pass it as it is
      command: `"${process.execPath}" -e "${PARENT_OF_SLEEPER}"`,
      timeout: 1500,
    });
    expect(result.success).toBe(false);
    expect(await gone(Number(result.stdout.trim()))).toBe(true);
  }, 20_000);
});

describe("shell.stream", () => {
  it("holds back a program that writes faster than the reader reads", async () => {
    const marker = join(mkdtempSync(join(tmpdir(), "shell-stream-")), "done");
    const script = [
      "let i = 0;",
      "function go() {",
      "  while (i < 200000) {",
      "    const ok = process.stdout.write('x'.repeat(40) + ' ' + i + '\\n'); i++;",
      "    if (!ok) { process.stdout.once('drain', go); return; }",
      "  }",
      `  require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'done');`,
      "}",
      "go();",
    ].join("\n");
    let read = 0;
    for await (const item of client.stream<unknown, ShellStreamItem>(
      { service: "shell", operation: "stream" },
      { command: process.execPath, args: ["-e", script] },
    )) {
      if (item.type === "stdout" && ++read === 5) break;
      if (read === 1) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    expect(existsSync(marker)).toBe(false);
  }, 20_000);
});
