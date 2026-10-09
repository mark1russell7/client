/**
 * The runner of the Composer. It runs a program in a Web Worker with a time limit, so a long
 * or endless program (a shared link with a huge `range`) cannot stop the page. The Stop button
 * and the time limit end the worker. The next run starts a new one.
 */

import type { Json } from "./program";
import type { RunResult } from "./runtime";
import type { WorkerMessage, WorkerRequest } from "./run-worker";

/** The time limit of one run, in milliseconds. */
export const RUN_LIMIT_MS = 8000;

export interface RunHandle {
  result: Promise<RunResult>;
}

function stoppedResult(reason: string, started: number, calls: number): RunResult {
  return { ok: false, stopped: true, error: reason, calls: [], dropped: calls, duration: performance.now() - started };
}

export class ProgramRunner {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending: { id: number; finish: (result: RunResult) => void; timer: ReturnType<typeof setTimeout>; calls: number; started: number } | null = null;

  constructor(private readonly onProgress: (calls: number) => void = () => {}) {}

  /** True while a run has no result. */
  get running(): boolean {
    return this.pending !== null;
  }

  private spawn(): Worker {
    const worker = new Worker(new URL("./run-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      const pending = this.pending;
      if (!pending || message.id !== pending.id) return;
      if (message.type === "progress") {
        pending.calls = message.calls;
        this.onProgress(message.calls);
        return;
      }
      this.settle(message.result);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      const pending = this.pending;
      this.kill();
      if (pending) {
        pending.finish(stoppedResult(`The program stopped the worker: ${event.message || "no memory or a crash"}.`, pending.started, pending.calls));
      }
    };
    return worker;
  }

  private settle(result: RunResult): void {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;
    pending.finish(result);
  }

  private kill(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  /** This function runs a program. A run that has no result yet stops first. */
  run(program: Json, limitMs: number = RUN_LIMIT_MS): Promise<RunResult> {
    this.stop("A newer run replaced this run.");
    const worker = (this.worker ??= this.spawn());
    const id = ++this.nextId;
    const started = performance.now();
    return new Promise<RunResult>((resolve) => {
      const timer = setTimeout(() => {
        const calls = this.pending?.calls ?? 0;
        this.kill();
        resolve(stoppedResult(`The program ran for more than ${limitMs / 1000} s, so the Composer stopped it.`, started, calls));
      }, limitMs);
      this.pending = { id, finish: resolve, timer, calls: 0, started };
      worker.postMessage({ id, program } satisfies WorkerRequest);
    });
  }

  /** This function stops the current run, if there is one. */
  stop(reason: string = "You stopped the program."): void {
    const pending = this.pending;
    if (!pending) return;
    this.kill();
    pending.finish(stoppedResult(reason, pending.started, pending.calls));
  }

  dispose(): void {
    this.kill();
  }
}
