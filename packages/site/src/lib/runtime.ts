/**
 * The runtime of the Composer: it runs a program with the real client.
 *
 * The program goes to `client.exec()` of `@mark1russell7/client`, the same function that
 * the `mark` CLI and the servers use. A traced registry wraps each core procedure, so each
 * call records its input, its output, its time and its parent call. The Composer starts this
 * runtime in a Web Worker (`run-worker.ts`), so a long program cannot stop the page.
 *
 * Hydration runs a call that is in the input of another call before that other call starts. The
 * hydration hook of the core (`observeHydration`) tells which call gets the result, so the trace
 * can show the call under its consumer, as the blocks of the Composer show it.
 */

import {
  Client,
  LocalTransport,
  PROCEDURE_REGISTRY,
  ProcedureRegistry,
  allCoreProcedures,
  metaProcedures,
  observeHydration,
  type AnyProcedure,
  type HydrationEvent,
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
  /**
   * The call that gets the result of this call as part of its input: hydration ran this call
   * for that call. The trace shows this call under its consumer.
   */
  consumer?: number;
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

  // The hydration event of the call that starts next. The core starts the handler of a ref in the
  // same synchronous run as the event (see `invokeProcedure`), so the next handler that starts is
  // the call of the event. An event that no handler takes in that run goes away.
  let pendingRef: HydrationEvent | null = null;
  const callOfRef = new Map<object, number>();
  /** The consumer ref of each call that hydration ran: null at the top of a hydrated value. */
  const consumerOf = new Map<number, object | null>();
  const stopObserving = observeHydration((event) => {
    pendingRef = event;
    queueMicrotask(() => {
      if (pendingRef === event) pendingRef = null;
    });
  });

  // The core procedures, and procedure.define/get/list/delete: a program can define a procedure
  // in this registry and call it in a later step
  const registry = new ProcedureRegistry();
  for (const procedure of [...allCoreProcedures, ...metaProcedures]) {
    registry.register(traced(procedure));
  }

  function traced(procedure: AnyProcedure): AnyProcedure {
    const handler = procedure.handler;
    const key = procedure.path.join(".");
    return {
      ...procedure,
      handler: async (input: unknown, ctx: ProcedureContext): Promise<unknown> => {
        const id = ++nextId;
        const event = pendingRef;
        pendingRef = null;
        if (event && event.path.join(".") === key) {
          callOfRef.set(event.ref, id);
          consumerOf.set(id, event.consumer ?? null);
        }
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
  } finally {
    stopObserving();
    linkConsumers(calls, callOfRef, consumerOf);
  }
}

/**
 * This function sets the `consumer` of each call that hydration ran.
 *
 * - The event names the consumer ref: its call gets the result.
 * - At the top of a hydrated value (no consumer ref), or when the consumer ref has no call in the
 *   trace (the root call of `exec()`), the next call of the same caller gets the result: that is
 *   the call whose input the caller hydrated (the root call, or the operand call of control flow).
 */
export function linkConsumers(calls: TraceCall[], callOfRef: Map<object, number>, consumerOf: Map<number, object | null>): void {
  const indexOf = new Map(calls.map((call, index) => [call.id, index]));
  for (const [id, ref] of consumerOf) {
    const index = indexOf.get(id);
    if (index === undefined) continue;
    const call = calls[index]!;
    const direct = ref ? callOfRef.get(ref) : undefined;
    if (direct !== undefined && direct !== id) {
      call.consumer = direct;
      continue;
    }
    for (let next = index + 1; next < calls.length; next++) {
      const candidate = calls[next]!;
      if (candidate.parent !== call.parent || consumerOf.has(candidate.id)) continue;
      call.consumer = candidate.id;
      break;
    }
  }
}
