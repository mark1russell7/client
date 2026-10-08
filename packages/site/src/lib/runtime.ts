/**
 * The runtime of the Composer: it runs a program in the browser with the real client.
 *
 * The program goes to `client.exec()` of `@mark1russell7/client`, the same function that
 * the `mark` CLI and the servers use. A traced registry wraps each core procedure, so each
 * call records its input, its output, its time and its parent call.
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
import type { Json } from "./program";

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
  /** Milliseconds. */
  duration: number;
}

// Meta procedures (client.eval, client.lookup) find procedures in the global registry
for (const procedure of allCoreProcedures) {
  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);
}

/** A copy that the trace can keep: later changes to the value do not change it. */
function snapshot(value: unknown): unknown {
  try {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/**
 * This function runs a program and gives its result and its trace.
 *
 * The parent of a call: a procedure calls another one through `ctx.client.call()`, and the
 * client starts the handler of the other procedure before its first `await`. Thus a variable
 * that holds the current caller during that synchronous part identifies the parent, also for
 * the concurrent calls of `client.parallel`.
 */
export async function runProgram(program: Json, onCall?: (calls: TraceCall[]) => void): Promise<RunResult> {
  const calls: TraceCall[] = [];
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
    return {
      ...procedure,
      handler: async (input: unknown, ctx: ProcedureContext): Promise<unknown> => {
        const call: TraceCall = {
          id: ++nextId,
          parent: caller,
          key: procedure.path.join("."),
          input: snapshot(input),
          start: now(),
        };
        calls.push(call);
        onCall?.(calls);
        const id = call.id;
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
          call.output = snapshot(output);
          return output;
        } catch (error) {
          call.error = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          call.end = now();
          onCall?.(calls);
        }
      },
    };
  }

  const client = new Client(new LocalTransport()).useRegistry(registry);
  try {
    const value = await client.exec(program as never);
    return { ok: true, value, calls, duration: now() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), calls, duration: now() };
  }
}
