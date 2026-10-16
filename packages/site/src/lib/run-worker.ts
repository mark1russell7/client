/**
 * The worker of the Composer: it runs one program at a time with `runProgram`, away from the
 * page. The page can end the worker at any time (the Stop button, the time limit).
 *
 * The worker serves the procedure `site.run` over a `PortTransport` of `@procedures/client`
 * (roadmap R27): a stream of `progress` items, then one `done` item. Before, the page and the
 * worker had a protocol of their own.
 */

import { PortTransport, type RequestHandler, type ServerResponse } from "@procedures/client/browser";
import { runProgram, type RunResult } from "./runtime";
import { snapshot } from "./display";
import type { Json } from "./program";

/** The input of `site.run`. */
export type RunInput = { program: Json };
/** An item of `site.run`: the number of calls so far, or the result. */
export type RunItem = { type: "progress"; calls: number } | { type: "done"; result: RunResult };

/** A result that a port can send: a value that a worker cannot send becomes its snapshot. */
function cloneable(result: RunResult): RunResult {
  try {
    structuredClone(result);
    return result;
  } catch {
    // The value holds something that a worker cannot send (a function, a class instance)
    return { ...result, value: snapshot(result.value, 100_000) };
  }
}

/** The items of one run: progress at most each 120 ms, then the result. */
async function* runItems(program: Json): AsyncGenerator<RunItem, void, undefined> {
  const items: RunItem[] = [];
  let wake: (() => void) | undefined;
  const push = (item: RunItem): void => {
    items.push(item);
    wake?.();
  };
  let last = 0;
  void runProgram(program, (calls) => {
    const now = performance.now();
    if (now - last > 120) {
      last = now;
      push({ type: "progress", calls });
    }
  }).then((result) => push({ type: "done", result: cloneable(result) }));
  for (;;) {
    while (items.length > 0) {
      const item = items.shift()!;
      yield item;
      if (item.type === "done") return;
    }
    await new Promise<void>((resolve) => (wake = resolve));
    wake = undefined;
  }
}

const runs: RequestHandler = {
  async handle(request): Promise<ServerResponse> {
    if (request.method.service !== "site" || request.method.operation !== "run") {
      return { id: request.id, status: { type: "error", code: "NOT_FOUND", message: "This worker serves only site.run", retryable: false }, metadata: {} };
    }
    return { id: request.id, status: { type: "success", code: 200 }, stream: runItems((request.payload as RunInput).program), metadata: {} };
  },
};

new PortTransport(self, { serve: runs });
