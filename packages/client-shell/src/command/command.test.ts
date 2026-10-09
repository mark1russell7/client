/**
 * runCommand and streamCommand: the one way the wrapper packages start a program (roadmap 2.2).
 * The tests start small Node scripts, so they run the same on Windows and elsewhere.
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand, streamCommand, type CommandStreamItem } from "./index.js";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

/**
 * A script that starts a grandchild that runs for ever, prints the grandchild's pid, then waits.
 * On Windows, Node puts a child in a job object that ends it with its parent. A program such as
 * cmd.exe does not, so the grandchild starts detached (outside the job) to show that case.
 */
const PARENT_OF_SLEEPER = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: process.platform === 'win32' });",
  "console.log(child.pid);",
  "setInterval(() => {}, 1000);",
].join("");

describe("runCommand", () => {
  it("gives stdout, stderr, the exit code and the duration", async () => {
    const result = await runCommand(process.execPath, {
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"],
    });
    expect(result).toMatchObject({ stdout: "out", stderr: "err", exitCode: 3, success: false });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("passes each argument as it is: no shell reads it", async () => {
    const result = await runCommand(process.execPath, {
      args: ["-e", "process.stdout.write(process.argv[1])", "$(echo x) & echo y | z"],
    });
    expect(result.stdout).toBe("$(echo x) & echo y | z");
  });

  it("writes the input to stdin, and gives the program an empty stdin without it", async () => {
    const echo = "let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => process.stdout.write('[' + s + ']'))";
    expect((await runCommand(process.execPath, { args: ["-e", echo], input: "hello" })).stdout).toBe("[hello]");
    // Before, stdin was an open pipe: a program that read it waited for ever
    expect((await runCommand(process.execPath, { args: ["-e", echo], timeout: 10_000 })).stdout).toBe("[]");
  });

  it("kills the whole process tree at the timeout (deep dive WRP-10)", async () => {
    const result = await runCommand(process.execPath, { args: ["-e", PARENT_OF_SLEEPER], timeout: 1500 });
    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
    expect(result.signal).toBe("SIGTERM");
    const grandchild = Number(result.stdout.trim());
    expect(grandchild).toBeGreaterThan(0);
    expect(await until(() => !alive(grandchild))).toBe(true);
  }, 15_000);

  it("kills the process tree when the signal aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1500);
    const started = Date.now();
    const result = await runCommand(process.execPath, { args: ["-e", PARENT_OF_SLEEPER], signal: controller.signal });
    expect(result.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
    const grandchild = Number(result.stdout.trim());
    expect(grandchild).toBeGreaterThan(0);
    expect(await until(() => !alive(grandchild))).toBe(true);
  }, 15_000);

  it("does not start a program when the signal has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const marker = join(mkdtempSync(join(tmpdir(), "run-command-")), "ran");
    const result = await runCommand(process.execPath, {
      args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`],
      signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("keeps the head of a large output, or its tail", async () => {
    const script = "for (let i = 0; i < 1000; i++) console.log('line ' + i)";
    const head = await runCommand(process.execPath, { args: ["-e", script], maxOutputBytes: 100 });
    expect(head.truncated).toEqual({ stdout: true, stderr: false });
    expect(head.stdout.startsWith("line 0\n")).toBe(true);
    expect(head.stdout).not.toContain("line 999");

    const tail = await runCommand(process.execPath, { args: ["-e", script], maxOutputBytes: 100, keep: "tail" });
    expect(tail.truncated).toEqual({ stdout: true, stderr: false });
    expect(tail.stdout.endsWith("line 999\n")).toBe(true);
    expect(tail.stdout).not.toContain("line 0\n");
  });

  it("reports a program that cannot start, and does not throw", async () => {
    const result = await runCommand("no-such-program-xyz", {});
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toMatch(/ENOENT/);
  });
});

describe("streamCommand", () => {
  it("gives each line while the program runs, then the exit", async () => {
    const items: CommandStreamItem[] = [];
    for await (const item of streamCommand(process.execPath, { args: ["-e", "console.log('a'); console.error('b'); console.log('c')"] })) {
      items.push(item);
    }
    expect(items.filter((item) => item.type === "stdout")).toEqual([
      { type: "stdout", line: "a" },
      { type: "stdout", line: "c" },
    ]);
    expect(items).toContainEqual({ type: "stderr", line: "b" });
    expect(items.at(-1)).toMatchObject({ type: "exit", exitCode: 0 });
  });

  it("stops reading the program when the reader is slow (deep dive WRP-9)", async () => {
    const marker = join(mkdtempSync(join(tmpdir(), "stream-command-")), "done");
    // The script writes about 10 MB and respects back-pressure: it writes the marker only when
    // the pipe took all the data
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
    const stream = streamCommand(process.execPath, { args: ["-e", script], highWaterMark: 100 });
    let read = 0;
    for await (const item of stream) {
      if (item.type === "stdout" && ++read === 5) break;
      if (read === 1) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(read).toBe(5);
    // A paused pipe holds the program back. Before, the queue took all 10 MB.
    expect(existsSync(marker)).toBe(false);
  }, 20_000);

  it("gives a long line in parts, so one line cannot fill the memory", async () => {
    const items: CommandStreamItem[] = [];
    for await (const item of streamCommand(process.execPath, {
      args: ["-e", "process.stdout.write('y'.repeat(5000))"],
      maxLineLength: 1000,
    })) {
      items.push(item);
    }
    const parts = items.filter((item) => item.type === "stdout");
    expect(parts.length).toBe(5);
    expect(parts.every((item) => item.type === "stdout" && item.line.length === 1000)).toBe(true);
  });

  it("kills the process tree when the reader stops", async () => {
    let grandchild = 0;
    for await (const item of streamCommand(process.execPath, { args: ["-e", PARENT_OF_SLEEPER] })) {
      if (item.type === "stdout") {
        grandchild = Number(item.line);
        break;
      }
    }
    expect(grandchild).toBeGreaterThan(0);
    expect(await until(() => !alive(grandchild))).toBe(true);
  }, 15_000);
});
