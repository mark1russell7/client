import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnOptions } from "node:child_process";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { CommandOptions, CommandResult } from "@procedures/shell/command";
import type { ClaudeEvent } from "./events.js";
import { CLAUDE_FLAGS, cancelTurn, followTurn, isProcessAlive, readTurn, startTurn, type SpawnedProcess, type Spawner, type TurnEvent } from "./turn.js";

const SESSION = "00000000-0000-4000-8000-000000000002";
const line = (value: unknown): string => `${JSON.stringify(value)}\n`;
const INIT = line({ type: "system", subtype: "init", session_id: SESSION, model: "example-model" });
const TEXT = line({ type: "assistant", message: { content: [{ type: "text", text: "Café" }] } });
const RESULT = line({ type: "result", subtype: "success", is_error: false, result: "Done.", session_id: SESSION, total_cost_usd: 0.001 });

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "claude-cli-test-"));
}

interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
}

/** A spawner that starts nothing. It gives a process with `pid`, or an error. */
function fakeSpawner(outcome: { pid?: number; error?: Error } = { pid: 4321 }): { spawner: Spawner; calls: SpawnCall[]; unrefs: number[] } {
  const calls: SpawnCall[] = [];
  const unrefs: number[] = [];
  const spawner: Spawner = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter() as EventEmitter & SpawnedProcess;
    Object.assign(child, { pid: outcome.error ? undefined : outcome.pid, unref: () => unrefs.push(1) });
    queueMicrotask(() => (outcome.error ? child.emit("error", outcome.error) : child.emit("spawn")));
    return child;
  };
  return { spawner, calls, unrefs };
}

async function collect(items: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const item of items) out.push(item);
  return out;
}

const types = (items: readonly TurnEvent[]): string[] => items.map((item) => item.event.type);

describe("startTurn", () => {
  it("starts the program detached, with the prompt file on stdin and the output file on stdout", async () => {
    const dir = scratch();
    const outputFile = join(dir, "turn.ndjson");
    writeFileSync(outputFile, INIT);
    const { spawner, calls, unrefs } = fakeSpawner();
    const turn = await startTurn({
      prompt: "Summarise the notes",
      cwd: dir,
      args: ["--resume", SESSION],
      outputFile,
      executable: "/opt/claude",
      env: { PATH: "/usr/bin" },
      spawner,
    });
    expect(turn).toMatchObject({ pid: 4321, outputFile, promptFile: `${outputFile}.prompt.txt`, offset: INIT.length, command: "/opt/claude" });
    expect(turn.args).toEqual([...CLAUDE_FLAGS, "--resume", SESSION]);
    expect(readFileSync(turn.promptFile, "utf8")).toBe("Summarise the notes");
    expect(Date.parse(turn.startedAt)).not.toBeNaN();
    expect(unrefs).toHaveLength(1);
    const { options } = calls[0]!;
    expect(options).toMatchObject({ cwd: dir, env: { PATH: "/usr/bin" }, detached: true, windowsHide: true, shell: false });
    expect(options.stdio).toHaveLength(3);
    expect((options.stdio as unknown[]).every((fd) => typeof fd === "number")).toBe(true);
  });

  it("puts the executable arguments first, and makes a temporary output file", async () => {
    const { spawner, calls } = fakeSpawner();
    const turn = await startTurn({ prompt: "x", executable: "node", executableArgs: ["/opt/cli.js"], spawner });
    expect(calls[0]!.args).toEqual(["/opt/cli.js", ...CLAUDE_FLAGS]);
    expect(turn.offset).toBe(0);
    expect(existsSync(turn.outputFile)).toBe(true);
    // A copy of the environment of the host
    expect(calls[0]!.options.env).not.toBe(process.env);
    expect(Object.keys(calls[0]!.options.env ?? {})).toEqual(Object.keys(process.env));
  });

  it("reports a program that does not start", async () => {
    const failing = fakeSpawner({ error: new Error("spawn /opt/claude ENOENT") });
    await expect(startTurn({ prompt: "x", executable: "/opt/claude", spawner: failing.spawner })).rejects.toThrow(/claude did not start: spawn \/opt\/claude ENOENT/);
    const noPid = fakeSpawner({});
    await expect(startTurn({ prompt: "x", executable: "/opt/claude", spawner: noPid.spawner })).rejects.toThrow(/no process id/);
  });

  describe("without a claude program", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("tells how to name the program", async () => {
      const empty = scratch();
      vi.stubEnv("CLAUDE_BIN", "");
      // The environment of Windows ignores the case of a name: one stub covers PATH and Path
      vi.stubEnv("PATH", "");
      vi.stubEnv("HOME", empty);
      vi.stubEnv("USERPROFILE", empty);
      await expect(startTurn({ prompt: "x", spawner: fakeSpawner().spawner })).rejects.toThrow(/claude program was not found.*CLAUDE_BIN/);
    });
  });

  it.runIf(process.platform === "win32")("refuses a batch file on Windows", async () => {
    await expect(startTurn({ prompt: "x", executable: "C:\\tools\\claude.cmd", spawner: fakeSpawner().spawner })).rejects.toThrow(/batch file/);
  });
});

describe("readTurn", () => {
  it("reads the complete lines and keeps a partial line for the next read", () => {
    const dir = scratch();
    const outputFile = join(dir, "turn.ndjson");
    const partial = TEXT.slice(0, 40);
    writeFileSync(outputFile, INIT + partial);
    const first = readTurn({ outputFile });
    expect(types(first.events)).toEqual(["meta"]);
    expect(first.offset).toBe(Buffer.byteLength(INIT));
    expect(first.finished).toBe(false);
    expect(first.running).toBeUndefined();

    appendFileSync(outputFile, TEXT.slice(40) + RESULT);
    const second = readTurn({ outputFile, offset: first.offset, pid: 4321, isAlive: () => true });
    expect(second.events.map((item) => item.event)).toEqual([
      { type: "text", text: "Café" },
      { type: "result", subtype: "success", isError: false, text: "Done.", sessionId: SESSION, costUsd: 0.001 },
    ]);
    // The offsets count bytes: "é" has two
    expect(second.events[0]!.offset).toBe(Buffer.byteLength(INIT + TEXT));
    expect(second.offset).toBe(Buffer.byteLength(INIT + TEXT + RESULT));
    expect(second.finished).toBe(true);
    expect(second.running).toBe(true);

    expect(readTurn({ outputFile, offset: second.offset })).toEqual({ events: [], offset: second.offset, finished: false, newBytes: 0 });
  });

  it("reads a last line without a line end when the process has ended", () => {
    const outputFile = join(scratch(), "turn.ndjson");
    writeFileSync(outputFile, INIT + "Error: an example failure");
    const running = readTurn({ outputFile, pid: 4321, isAlive: () => true });
    expect(types(running.events)).toEqual(["meta"]);
    const ended = readTurn({ outputFile, pid: 4321, isAlive: () => false });
    expect(ended.events.map((item) => item.event)).toEqual([
      { type: "meta", subtype: "init", sessionId: SESSION, model: "example-model" },
      { type: "log", text: "Error: an example failure" },
    ]);
    expect(ended.offset).toBe(Buffer.byteLength(INIT + "Error: an example failure"));
    expect(ended.running).toBe(false);
  });

  it("gives nothing for a file that does not exist", () => {
    expect(readTurn({ outputFile: join(scratch(), "none.ndjson"), offset: 5, pid: 4321, isAlive: () => false })).toEqual({
      events: [],
      offset: 5,
      finished: false,
      newBytes: 0,
      running: false,
    });
  });
});

describe("followTurn", () => {
  it("gives the events while the file grows, and stops after the result", async () => {
    const outputFile = join(scratch(), "turn.ndjson");
    writeFileSync(outputFile, INIT);
    const parts = [TEXT, RESULT, line({ type: "assistant", message: { content: [{ type: "text", text: "after the result" }] } })];
    const timer = setInterval(() => {
      const part = parts.shift();
      if (part === undefined) clearInterval(timer);
      else appendFileSync(outputFile, part);
    }, 30);
    try {
      const items = await collect(followTurn({ outputFile, pid: 4321, isAlive: () => true, pollMs: 10 }));
      expect(types(items)).toEqual(["meta", "text", "result"]);
    } finally {
      clearInterval(timer);
    }
  });

  it("continues from an offset", async () => {
    const outputFile = join(scratch(), "turn.ndjson");
    writeFileSync(outputFile, INIT + TEXT + RESULT);
    const items = await collect(followTurn({ outputFile, offset: Buffer.byteLength(INIT), pollMs: 10 }));
    expect(types(items)).toEqual(["text", "result"]);
  });

  it("gives an error event when the process ends without a result", async () => {
    const outputFile = join(scratch(), "turn.ndjson");
    writeFileSync(outputFile, INIT + TEXT);
    const items = await collect(followTurn({ outputFile, pid: 4321, isAlive: () => false, pollMs: 10, quietReads: 2 }));
    expect(types(items)).toEqual(["meta", "text", "error"]);
    expect(items.at(-1)!.event).toEqual({ type: "error", message: "The process ended without a result" });
    expect(items.at(-1)!.offset).toBe(Buffer.byteLength(INIT + TEXT));
  });

  it("stops when the signal aborts", async () => {
    const outputFile = join(scratch(), "turn.ndjson");
    writeFileSync(outputFile, INIT);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const items = await collect(followTurn({ outputFile, pid: 4321, isAlive: () => true, pollMs: 20, signal: controller.signal }));
    expect(types(items)).toEqual(["meta"]);
    const aborted = new AbortController();
    aborted.abort();
    expect(await collect(followTurn({ outputFile, signal: aborted.signal }))).toEqual([]);
  });
});

describe("cancelTurn", () => {
  const ok: CommandResult = { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1 };

  it("refuses an id that is not a process of a turn", async () => {
    await expect(cancelTurn(1)).rejects.toThrow(/refuses the process id 1/);
    await expect(cancelTurn(0)).rejects.toThrow(/refuses/);
    await expect(cancelTurn(-5)).rejects.toThrow(/refuses/);
    await expect(cancelTurn(2.5)).rejects.toThrow(/refuses/);
    await expect(cancelTurn(process.pid)).rejects.toThrow(/process of the host/);
  });

  it("does nothing for a process that does not run", async () => {
    expect(await cancelTurn(4321, { isAlive: () => false })).toEqual({ stopped: false, reason: "The process has ended" });
  });

  it("starts taskkill for the process tree on Windows", async () => {
    const calls: { command: string; options: CommandOptions }[] = [];
    const runner = async (command: string, options: CommandOptions): Promise<CommandResult> => {
      calls.push({ command, options });
      return ok;
    };
    expect(await cancelTurn(4321, { platform: "win32", runner, isAlive: () => true })).toEqual({ stopped: true });
    expect(calls[0]).toMatchObject({ command: "taskkill", options: { args: ["/T", "/F", "/PID", "4321"] } });

    const failing = async (): Promise<CommandResult> => ({ ...ok, exitCode: 128, success: false, stderr: "ERROR: not found\n" });
    expect(await cancelTurn(4321, { platform: "win32", runner: failing, isAlive: () => true })).toEqual({ stopped: false, reason: "ERROR: not found" });
    const silent = async (): Promise<CommandResult> => ({ ...ok, exitCode: 1, success: false });
    expect(await cancelTurn(4321, { platform: "win32", runner: silent, isAlive: () => true })).toEqual({ stopped: false, reason: "taskkill gave the exit code 1" });
  });

  it("signals the process group on POSIX, then the process", async () => {
    const signals: [number, string][] = [];
    expect(await cancelTurn(4321, { platform: "linux", isAlive: () => true, kill: (pid, signal) => void signals.push([pid, signal]) })).toEqual({ stopped: true });
    expect(signals).toEqual([[-4321, "SIGTERM"]]);

    const groupless: [number, string][] = [];
    const kill = (pid: number, signal: string): void => {
      if (pid < 0) throw new Error("ESRCH");
      groupless.push([pid, signal]);
    };
    expect(await cancelTurn(4321, { platform: "darwin", isAlive: () => true, kill, signal: "SIGKILL" })).toEqual({ stopped: true });
    expect(groupless).toEqual([[4321, "SIGKILL"]]);

    const refusing = (): void => {
      throw new Error("EPERM");
    };
    expect(await cancelTurn(4321, { platform: "linux", isAlive: () => true, kill: refusing })).toEqual({ stopped: false, reason: "EPERM" });
  });
});

describe("isProcessAlive", () => {
  it("tells if a process runs", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(99_999_999)).toBe(false);
  });
});

/**
 * A made-up claude: a Node script that reads the prompt on stdin and writes stream-json lines.
 * FAKE_MODE=stall writes one line and waits. FAKE_MODE=crash writes one line and ends with an error.
 */
const FAKE_CLAUDE = `
import { readFileSync } from "node:fs";
const prompt = readFileSync(0, "utf8");
const out = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
out({ type: "system", subtype: "init", session_id: "${SESSION}", model: "example-model" });
const mode = process.env.FAKE_MODE ?? "answer";
if (mode === "stall") setInterval(() => {}, 1000);
else if (mode === "crash") { process.stderr.write("Error: an example failure\\n"); process.exit(1); }
else setTimeout(() => {
  out({ type: "assistant", message: { content: [{ type: "text", text: "prompt: " + prompt } ] } });
  out({ type: "assistant", message: { content: [{ type: "text", text: "args: " + process.argv.slice(2).join(" ") } ] } });
  process.stderr.write("a warning\\n");
  out({ type: "result", subtype: "success", is_error: false, result: "Done.", session_id: "${SESSION}" });
}, 50);
`;

describe("a turn of a real process", () => {
  const dir = scratch();
  const script = join(dir, "fake-claude.mjs");
  writeFileSync(script, FAKE_CLAUDE);
  const started: number[] = [];

  afterAll(async () => {
    for (const pid of started) if (isProcessAlive(pid)) await cancelTurn(pid);
  });

  const start = async (mode: string, prompt = "Hello"): Promise<{ pid: number; outputFile: string; offset: number }> => {
    const turn = await startTurn({
      prompt,
      executable: process.execPath,
      executableArgs: [script],
      args: ["--model", "example-model"],
      cwd: dir,
      env: { ...process.env, FAKE_MODE: mode },
    });
    started.push(turn.pid);
    return turn;
  };

  it("writes the output to the file, and the follow gives the events up to the result", async () => {
    const turn = await start("answer", "Hello, turn");
    const items = await collect(followTurn({ outputFile: turn.outputFile, pid: turn.pid, pollMs: 50 }));
    const events: ClaudeEvent[] = items.map((item) => item.event);
    expect(events[0]).toMatchObject({ type: "meta", sessionId: SESSION });
    expect(events).toContainEqual({ type: "text", text: "prompt: Hello, turn" });
    expect(events).toContainEqual({ type: "text", text: `args: ${[...CLAUDE_FLAGS, "--model", "example-model"].join(" ")}` });
    expect(events).toContainEqual({ type: "log", text: "a warning" });
    expect(events.at(-1)).toMatchObject({ type: "result", text: "Done.", sessionId: SESSION });
  }, 30_000);

  it("gives an error event when the process ends without a result", async () => {
    const turn = await start("crash");
    const items = await collect(followTurn({ outputFile: turn.outputFile, pid: turn.pid, pollMs: 50 }));
    expect(types(items)).toEqual(["meta", "log", "error"]);
  }, 30_000);

  it("stops the process with cancelTurn, and the follow ends", async () => {
    const turn = await start("stall");
    const follow = collect(followTurn({ outputFile: turn.outputFile, pid: turn.pid, pollMs: 50 }));
    // Wait for the first line: the process runs
    const deadline = Date.now() + 15_000;
    while (readTurn({ outputFile: turn.outputFile }).events.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await cancelTurn(turn.pid)).toEqual({ stopped: true });
    const items = await follow;
    expect(types(items)).toEqual(["meta", "error"]);
    expect(isProcessAlive(turn.pid)).toBe(false);
  }, 30_000);
});
