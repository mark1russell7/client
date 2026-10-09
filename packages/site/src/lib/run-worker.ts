/**
 * The worker of the Composer: it runs one program at a time with `runProgram`, away from the
 * page. The page can end the worker at any time (the Stop button, the time limit).
 */

import { runProgram, type RunResult } from "./runtime";
import { snapshot } from "./display";
import type { Json } from "./program";

export type WorkerRequest = { id: number; program: Json };
export type WorkerMessage =
  | { id: number; type: "progress"; calls: number }
  | { id: number; type: "done"; result: RunResult };

const port = self as unknown as {
  postMessage(message: WorkerMessage): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

port.onmessage = (event) => {
  const { id, program } = event.data;
  let last = 0;
  void runProgram(program, (calls) => {
    const now = performance.now();
    if (now - last > 120) {
      last = now;
      port.postMessage({ id, type: "progress", calls });
    }
  }).then((result) => {
    try {
      port.postMessage({ id, type: "done", result });
    } catch {
      // The value holds something that a worker cannot send (a function, a class instance)
      port.postMessage({ id, type: "done", result: { ...result, value: snapshot(result.value, 100_000) } });
    }
  });
};
