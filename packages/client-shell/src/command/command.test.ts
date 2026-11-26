/**
 * runCommand and streamCommand: the one way the wrapper packages start a program (roadmap 2.2).
 * The tests start small Node scripts, so they run the same on Windows and elsewhere.
 */

import { afterEach, describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { ProcessRegistry, runCommand, streamCommand, type CommandStreamItem } from "./index.js";

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

/**
 * A script whose child keeps the output pipes after the script ends. The script prints the pid of
 * the child and ends at once. With `leave`, the child starts outside the group of the script (and
 * outside its job object on Windows), so no signal to the tree reaches it. The child ends after 60 s.
 */
function parentThatLeavesPipes(leave: boolean): string {
  return [
    "const { spawn } = require('node:child_process');",
    `const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: ['ignore', 'inherit', 'inherit'], detached: ${String(leave)} });`,
    "console.log(child.pid);",
    "child.unref();",
  ].join("");
}

describe("a descendant that keeps the output pipes after the first process ends", () => {
  const holders: number[] = [];
  /** This function records the pid in the first line of the output, so the test end kills it. */
  const holder = (output: string): number => {
    const pid = Number(output.trim().split(/\r?\n/)[0]);
    if (pid > 0) holders.push(pid);
    return pid;
  };
  afterEach(() => {
    for (const pid of holders.splice(0)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The process ended
      }
    }
  });

  it("does not hold runCommand after its timeout", async () => {
    const started = Date.now();
    const result = await runCommand(process.execPath, { args: ["-e", parentThatLeavesPipes(true)], timeout: 2000 });
    expect(holder(result.stdout)).toBeGreaterThan(0);
    expect(result).toMatchObject({ timedOut: true, success: false, exitCode: 0, signal: "SIGTERM" });
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);

  it("does not hold runCommand after the abort of its signal", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const started = Date.now();
    const result = await runCommand(process.execPath, { args: ["-e", parentThatLeavesPipes(true)], signal: controller.signal });
    expect(holder(result.stdout)).toBeGreaterThan(0);
    expect(result).toMatchObject({ aborted: true, success: false });
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);

  it("does not hold streamCommand after its timeout", async () => {
    const items: CommandStreamItem[] = [];
    const started = Date.now();
    for await (const item of streamCommand(process.execPath, { args: ["-e", parentThatLeavesPipes(true)], timeout: 2000 })) items.push(item);
    const first = items[0];
    expect(first?.type).toBe("stdout");
    holder(first?.type === "stdout" ? first.line : "");
    expect(items.at(-1)).toMatchObject({ type: "exit", timedOut: true });
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);

  it("ends the record at the stop of the registry", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", parentThatLeavesPipes(true)] });
    const ready = await registry.waitFor(started.id, /(\d+)/, 10_000);
    holder(ready[1] ?? "");
    // The first process ends at once, so the stop finds a record whose pipes a descendant keeps
    const pid = started.pid;
    expect(pid).toBeGreaterThan(0);
    expect(await until(() => !alive(pid))).toBe(true);
    const stopped = await registry.stop(started.id);
    expect(stopped.stopped).toBe(true);
    expect(registry.get(started.id)?.status).toBe("exited");
  }, 20_000);

  it.skipIf(process.platform === "win32")("signals the group of a first process that ended, so a descendant in the group ends", async () => {
    const result = await runCommand(process.execPath, { args: ["-e", parentThatLeavesPipes(false)], timeout: 2000 });
    const pid = holder(result.stdout);
    expect(pid).toBeGreaterThan(0);
    expect(result.timedOut).toBe(true);
    expect(await until(() => !alive(pid))).toBe(true);
  }, 15_000);
});

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

  it("pipes a stream to stdin, and the end of the stream ends stdin", async () => {
    const upper = "process.stdin.setEncoding('utf8'); let all = ''; process.stdin.on('data', (d) => { all += d; }); process.stdin.on('end', () => console.log(all.toUpperCase()));";
    const input = Readable.from(["a\nb", "\nc"]);
    const lines: string[] = [];
    for await (const item of streamCommand(process.execPath, { args: ["-e", upper], input })) {
      if (item.type === "stdout") lines.push(item.line);
    }
    expect(lines).toEqual(["A", "B", "C"]);
  });

  it("leaves the stream of the caller open when the program ends first", async () => {
    const input = new PassThrough();
    input.write("x\n");
    const items: CommandStreamItem[] = [];
    for await (const item of streamCommand(process.execPath, { args: ["-e", "process.exit(0)"], input })) items.push(item);
    expect(items.at(-1)).toMatchObject({ type: "exit", exitCode: 0 });
    expect(input.destroyed).toBe(false);
    expect(input.listenerCount("data")).toBe(0);
    input.end();
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
