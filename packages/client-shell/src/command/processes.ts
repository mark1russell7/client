/**
 * The registry of long-running processes (deep dive WRP-4, WRP-10).
 *
 * Some procedures start a process and return while it runs: `vitest.watch`, `node.spawn`,
 * `vite.dev`. Before, they started it detached and forgot it, so nothing could stop it, and it
 * kept running after the host ended. The registry gives each process:
 * - a record (id, pid, status, exit code), which `list` and `get` give;
 * - a `stop` that kills the whole process tree;
 * - the end of its output (the last 64 KiB), which also keeps its pipes from filling;
 * - the output after a time, for a follower: `subscribe` and `follow`;
 * - an end with the host: the host does not wait for the process, and kills it when it ends.
 *
 * The registry keeps the records of ended processes, up to `keepExited` of them.
 */

import type { ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
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

/** One piece of the output of a process, as `subscribe` gives it. */
export interface ProcessOutputChunk {
  /** The stream of the piece. */
  stream: "stdout" | "stderr";
  /** The bytes of the piece. A piece can end in a line or in a UTF-8 character. */
  data: Buffer;
}

/** The functions that `subscribe` calls for one subscriber. */
export interface ProcessOutputListener {
  /** This function gets each piece of output that the process writes after the subscription. */
  output?(chunk: ProcessOutputChunk): void;
  /** This function gets a copy of the record when the process ends. After it, no call comes. */
  end?(info: ManagedProcessInfo): void;
}

/** One item of `follow`. */
export type ProcessFollowItem =
  /** The output that the registry kept before the subscription: the first item with `backlog`. */
  | { type: "backlog"; text: string }
  /** A piece of new output, decoded as UTF-8. A piece can end in the middle of a line. */
  | { type: "output"; stream: "stdout" | "stderr"; text: string }
  /** The reader was slow, so the follower dropped the oldest pieces: this many bytes. */
  | { type: "dropped"; bytes: number }
  /** The end of the process: the last item. */
  | { type: "end"; info: ManagedProcessInfo };

/** The options of `follow`. */
export interface FollowOptions {
  /** True: the first item is the output that the registry kept before the subscription. */
  backlog?: boolean | undefined;
  /** An abort ends the stream. The process continues. */
  signal?: AbortSignal | undefined;
  /**
   * The most bytes of output that wait for the reader. Above it, the follower drops the oldest
   * pieces and gives a `dropped` item, because the registry cannot slow the process.
   * @default 1 MiB
   */
  maxBufferedBytes?: number | undefined;
}

/** The default of `maxBufferedBytes` of `follow`. */
export const FOLLOW_BUFFER_BYTES: number = 1024 * 1024;

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
  /** The subscribers of `subscribe`. The end of the process removes them. */
  listeners: Set<ProcessOutputListener>;
  done: Promise<void>;
}

/** This function calls a function of a subscriber. An error of a subscriber does not reach the registry. */
function notify(run: () => void): void {
  try {
    run();
  } catch (error) {
    console.error("A subscriber of the process registry failed:", error);
  }
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
    const listeners = new Set<ProcessOutputListener>();
    const changed = (): void => {
      for (const watcher of [...watchers]) watcher();
    };
    const received = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      output.add(chunk);
      for (const listener of [...listeners]) notify(() => listener.output?.({ stream, data: chunk }));
      changed();
    };
    child.stdout!.on("data", (chunk: Buffer) => received("stdout", chunk));
    child.stderr!.on("data", (chunk: Buffer) => received("stderr", chunk));

    const done = new Promise<void>((resolve) => {
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        info.exitedAt = new Date().toISOString();
        resolve();
        changed();
        // The end is the last call to a subscriber: the registry then forgets each subscriber
        const ending = [...listeners];
        listeners.clear();
        for (const listener of ending) notify(() => listener.end?.({ ...info, args: [...info.args] }));
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

    this.entries.set(id, { info, child, output, watchers, listeners, done });
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

  /**
   * This function subscribes to the output of a process. `listener.output` gets each piece of
   * output after this call, with its stream. `listener.end` gets the record at the end of the
   * process, and then the registry forgets the subscriber. For a process that ended already,
   * `listener.end` runs at once. The result removes the subscriber. It is undefined when the
   * registry has no process of this id.
   */
  subscribe(id: string, listener: ProcessOutputListener): (() => void) | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.info.exitedAt) {
      notify(() => listener.end?.({ ...entry.info, args: [...entry.info.args] }));
      return () => undefined;
    }
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }

  /**
   * This function gives the output of a process as a stream, until the process ends or the
   * signal aborts. The subscription starts when the reader asks for the first item, and the
   * end of the stream removes it: an end of the process, an abort, or a reader that stops. With
   * `backlog`, the first item is the output that the registry kept until then, without a gap.
   * The last item of an ended process is `end`. An unknown id throws at the first item.
   */
  async *follow(id: string, options: FollowOptions = {}): AsyncGenerator<ProcessFollowItem, void, undefined> {
    const limit = Math.max(1, options.maxBufferedBytes ?? FOLLOW_BUFFER_BYTES);
    const signal = options.signal;
    const queue: Array<{ item: ProcessFollowItem; bytes: number }> = [];
    let queued = 0;
    let dropped = 0;
    let ended: ManagedProcessInfo | undefined;
    let wake: (() => void) | undefined;
    const wakeUp = (): void => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };
    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    const add = (stream: "stdout" | "stderr", text: string, bytes: number): void => {
      if (text === "") return;
      queue.push({ item: { type: "output", stream, text }, bytes });
      queued += bytes;
      // The registry cannot slow the process: above the limit, the oldest pieces go
      while (queued > limit && queue.length > 1) {
        const oldest = queue.shift()!;
        queued -= oldest.bytes;
        dropped += oldest.bytes;
      }
    };

    if (signal?.aborted) return;
    const backlog = options.backlog ? this.output(id) : "";
    const unsubscribe = this.subscribe(id, {
      output: ({ stream, data }) => {
        add(stream, decoders[stream].write(data), data.length);
        wakeUp();
      },
      end: (info) => {
        for (const stream of ["stdout", "stderr"] as const) {
          const rest = decoders[stream].end();
          add(stream, rest, Buffer.byteLength(rest));
        }
        ended = info;
        wakeUp();
      },
    });
    if (!unsubscribe) throw new Error(`No process ${id}`);
    signal?.addEventListener("abort", wakeUp, { once: true });
    try {
      if (options.backlog) yield { type: "backlog", text: backlog };
      for (;;) {
        if (signal?.aborted) return;
        if (dropped > 0) {
          const bytes = dropped;
          dropped = 0;
          yield { type: "dropped", bytes };
          continue;
        }
        const next = queue.shift();
        if (next) {
          queued -= next.bytes;
          yield next.item;
          continue;
        }
        if (ended) {
          yield { type: "end", info: ended };
          return;
        }
        await new Promise<void>((resolve) => (wake = resolve));
      }
    } finally {
      unsubscribe();
      signal?.removeEventListener("abort", wakeUp);
    }
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
