/**
 * The registry of long-running processes (deep dive WRP-4, WRP-10).
 *
 * Some procedures start a process and return while it runs: `vitest.watch`, `node.spawn`,
 * `vite.dev`. Before, they started it detached and forgot it, so nothing could stop it, and it
 * kept running after the host ended. The registry gives each process:
 * - a record (id, pid, status, exit code), which `list` and `get` give;
 * - a `stop` that kills the whole process tree;
 * - the end of its output (the last 64 KiB), which also keeps its pipes from filling;
 * - an end with the host: the host does not wait for the process, and kills it when it ends.
 *
 * The registry keeps the records of ended processes, up to `keepExited` of them.
 */

import type { ChildProcess } from "node:child_process";
import { killTree } from "./tree-kill.js";
import { OutputCollector } from "./output.js";
import { startChild, startError, type SpawnOptions } from "./spawn.js";

export interface ManagedProcessInfo {
  id: string;
  pid: number;
  command: string;
  args: string[];
  cwd?: string;
  /** The kind of process, set by the procedure that started it (for example "vitest"). */
  group?: string;
  /** A name for people. */
  label?: string;
  status: "running" | "exited" | "error";
  startedAt: string;
  exitedAt?: string;
  exitCode?: number;
  signal?: string;
  /** The error that kept the program from starting. */
  error?: string;
}

export interface StartProcessOptions extends SpawnOptions {
  group?: string | undefined;
  label?: string | undefined;
}

export interface StopResult {
  /** True when this call ended a running process. */
  stopped: boolean;
  exitCode?: number;
  signal?: string;
}

/** The end of the output that the registry keeps for each process. */
const OUTPUT_TAIL_BYTES = 64 * 1024;
/** How long `stop` waits after the first kill, before it kills again with SIGKILL. */
const STOP_GRACE_MS = 5000;

// The CSI and OSC escape sequences of terminals (colors, styles, links)
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** This function removes the ANSI escape sequences from a text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

interface Entry {
  info: ManagedProcessInfo;
  child: ChildProcess;
  output: OutputCollector;
  /** Called after each output chunk and at the end. */
  watchers: Set<() => void>;
  done: Promise<void>;
}

export class ProcessRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly keepExited: number;
  private counter = 0;

  constructor(options: { keepExited?: number } = {}) {
    this.keepExited = options.keepExited ?? 50;
  }

  /** This function starts a program and records it. The program inherits no stdin. */
  start(command: string, options: StartProcessOptions = {}): ManagedProcessInfo {
    const child = startChild(command, options, "ignore");
    const id = `${options.group ?? "process"}-${Date.now().toString(36)}-${++this.counter}`;
    const info: ManagedProcessInfo = {
      id,
      pid: child.pid ?? 0,
      command,
      args: [...(options.args ?? [])],
      status: "running",
      startedAt: new Date().toISOString(),
    };
    if (options.cwd !== undefined) info.cwd = options.cwd;
    if (options.group !== undefined) info.group = options.group;
    if (options.label !== undefined) info.label = options.label;

    const output = new OutputCollector(OUTPUT_TAIL_BYTES, "tail");
    const watchers = new Set<() => void>();
    const changed = (): void => {
      for (const watcher of [...watchers]) watcher();
    };
    child.stdout!.on("data", (chunk: Buffer) => {
      output.add(chunk);
      changed();
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      output.add(chunk);
      changed();
    });

    const done = new Promise<void>((resolve) => {
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        info.exitedAt = new Date().toISOString();
        resolve();
        changed();
        this.reap();
      };
      child.on("error", (error) => {
        info.error = startError(error);
        if (child.pid === undefined) {
          info.status = "error";
          finish();
        }
      });
      child.on("close", (code, signal) => {
        info.status = info.error ? "error" : "exited";
        if (code !== null) info.exitCode = code;
        if (signal) info.signal = signal;
        finish();
      });
    });

    // The host does not wait for the process: it ends when the host ends (see tree-kill.ts)
    child.unref();
    for (const stream of [child.stdout, child.stderr]) {
      (stream as unknown as { unref?: () => void } | null)?.unref?.();
    }

    this.entries.set(id, { info, child, output, watchers, done });
    this.reap();
    return { ...info };
  }

  /** This function gives a copy of the record of a process. */
  get(id: string): ManagedProcessInfo | undefined {
    const entry = this.entries.get(id);
    return entry ? { ...entry.info } : undefined;
  }

  /** This function gives copies of the records, oldest first. */
  list(filter: { group?: string | undefined } = {}): ManagedProcessInfo[] {
    const result: ManagedProcessInfo[] = [];
    for (const entry of this.entries.values()) {
      if (filter.group !== undefined && entry.info.group !== filter.group) continue;
      result.push({ ...entry.info });
    }
    return result;
  }

  /** This function gives the end of the output of a process (stdout and stderr together). */
  output(id: string): string {
    return this.entries.get(id)?.output.text() ?? "";
  }

  /** This function waits until the process ends, then gives its record. */
  async exited(id: string): Promise<ManagedProcessInfo | undefined> {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    await entry.done;
    return { ...entry.info };
  }

  /**
   * This function waits until the output of the process matches `pattern`, and gives the match.
   * The pattern sees the output without ANSI escape codes: a program can color its output when
   * the environment has `FORCE_COLOR`. It rejects when the process ends first, or after
   * `timeout` milliseconds.
   */
  waitFor(id: string, pattern: RegExp, timeout = 30_000): Promise<RegExpMatchArray> {
    const entry = this.entries.get(id);
    if (!entry) return Promise.reject(new Error(`No process ${id}`));
    return new Promise((resolve, reject) => {
      const check = (): void => {
        const match = stripAnsi(entry.output.text()).match(pattern);
        if (match) {
          stop();
          resolve(match);
        } else if (entry.info.status !== "running" || entry.info.exitedAt) {
          stop();
          const code = entry.info.exitCode ?? entry.info.signal ?? entry.info.error;
          reject(new Error(`Process ${id} exited (${code}) before its output matched ${pattern}`));
        }
      };
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`Timeout after ${timeout} ms: the output of process ${id} did not match ${pattern}`));
      }, timeout);
      const stop = (): void => {
        clearTimeout(timer);
        entry.watchers.delete(check);
      };
      entry.watchers.add(check);
      check();
    });
  }

  /**
   * This function kills the process tree and waits for the end. When the process does not end
   * within the grace time, it kills again with SIGKILL.
   */
  async stop(id: string, signal: NodeJS.Signals = "SIGTERM"): Promise<StopResult> {
    const entry = this.entries.get(id);
    if (!entry || entry.info.exitedAt) {
      return entry ? this.stopResult(entry, false) : { stopped: false };
    }
    killTree(entry.child, signal);
    if (!(await this.endsWithin(entry, STOP_GRACE_MS))) {
      killTree(entry.child, "SIGKILL");
      await this.endsWithin(entry, STOP_GRACE_MS);
    }
    return this.stopResult(entry, true);
  }

  /** This function stops every running process of the registry (or of one group). */
  async stopAll(filter: { group?: string | undefined } = {}): Promise<number> {
    const running = this.list(filter).filter((info) => info.status === "running");
    await Promise.all(running.map((info) => this.stop(info.id)));
    return running.length;
  }

  /** This function removes the record of an ended process. It keeps the record of a running one. */
  forget(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || !entry.info.exitedAt) return false;
    return this.entries.delete(id);
  }

  /** This function removes the oldest records of ended processes past `keepExited`. */
  reap(): number {
    const ended = [...this.entries.values()].filter((entry) => entry.info.exitedAt);
    const excess = ended.length - this.keepExited;
    for (let i = 0; i < excess; i++) this.entries.delete(ended[i]!.info.id);
    return Math.max(0, excess);
  }

  private stopResult(entry: Entry, stopped: boolean): StopResult {
    const result: StopResult = { stopped };
    if (entry.info.exitCode !== undefined) result.exitCode = entry.info.exitCode;
    if (entry.info.signal !== undefined) result.signal = entry.info.signal;
    return result;
  }

  private async endsWithin(entry: Entry, ms: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const ended = await Promise.race([
      entry.done.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
    clearTimeout(timer);
    return ended;
  }
}

/** The registry of the host process. The procedures of the wrapper packages use it. */
export const processes: ProcessRegistry = new ProcessRegistry();
