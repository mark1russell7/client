/**
 * The runtime of the Composer: it runs a program with the real client.
 *
 * The program goes to `client.exec()` of `@mark1russell7/client`, the same function that
 * the `mark` CLI and the servers use. A traced registry wraps each core procedure, so each
 * call records its input, its output, its time and its parent call. The Composer starts this
 * runtime in a Web Worker (`run-worker.ts`), so a long program cannot stop the page.
 */

import {
  Client,
  LocalTransport,
  PROCEDURE_REGISTRY,
  ProcedureRegistry,
  allCoreProcedures,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedurePath,
} from "@mark1russell7/client/browser";
import { snapshot } from "./display";
import type { Json } from "./program";

/** The calls that a run records. After this number, the run counts the calls but does not keep them. */
export const MAX_TRACE_CALLS = 5000;

/** One procedure call of a run. */
export interface TraceCall {
  id: number;
  /** The call that started this call. `null` for a call of the top level. */
  parent: number | null;
  key: string;
  input: unknown;
  output?: unknown;
  error?: string;
  /** Milliseconds from the start of the run. */
  start: number;
  end?: number;
}

export interface RunResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  calls: TraceCall[];
  /** The calls that ran after the trace was full. */
  dropped: number;
  /** Milliseconds. */
  duration: number;
  /** The Composer stopped the run (the Stop button or the time limit). */
  stopped?: boolean;
}

// Meta procedures (client.eval, client.lookup) find procedures in the global registry
for (const procedure of allCoreProcedures) {
  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);
}

/**
 * This function runs a program and gives its result and its trace. `onCall` gets the number
 * of calls after each call starts.
 *
 * The parent of a call: a procedure calls another one through `ctx.client.call()`, and the
 * client starts the handler of the other procedure before its first `await`. Thus a variable
 * that holds the current caller during that synchronous part identifies the parent, also for
 * the concurrent calls of `client.parallel`.
 */
export async function runProgram(program: Json, onCall?: (count: number) => void): Promise<RunResult> {
  const calls: TraceCall[] = [];
  let dropped = 0;
  const started = performance.now();
  const now = (): number => Math.round((performance.now() - started) * 100) / 100;
  let nextId = 0;
  let caller: number | null = null;

  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) {
    registry.register(traced(procedure));
  }

  function traced(procedure: AnyProcedure): AnyProcedure {
    const handler = procedure.handler;
    const key = procedure.path.join(".");
    return {
      ...procedure,
      handler: async (input: unknown, ctx: ProcedureContext): Promise<unknown> => {
        const id = ++nextId;
        let call: TraceCall | undefined;
        if (calls.length < MAX_TRACE_CALLS) {
          call = { id, parent: caller, key, input: snapshot(input), start: now() };
          calls.push(call);
        } else {
          dropped++;
        }
        onCall?.(calls.length + dropped);
        const tracedContext: ProcedureContext = {
          ...ctx,
          client: {
            call: <TInput, TOutput>(path: ProcedurePath, nested: TInput): Promise<TOutput> => {
              const previous = caller;
              caller = id;
              try {
                return ctx.client.call<TInput, TOutput>(path, nested);
              } finally {
                caller = previous;
              }
            },
          },
        };
        try {
          const output: unknown = await handler?.(input, tracedContext);
          if (call) call.output = snapshot(output);
          return output;
        } catch (error) {
          if (call) call.error = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          if (call) call.end = now();
        }
      },
    };
  }

  const client = new Client(new LocalTransport()).useRegistry(registry);
  try {
    const value = await client.exec(program as never);
    return { ok: true, value, calls, dropped, duration: now() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), calls, dropped, duration: now() };
  }
}
