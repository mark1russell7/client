/**
 * A test helper for the tests that call the handler of a procedure directly.
 *
 * A handler gives one value or a stream (an async generator), so its type is a union. The
 * control-flow tests read one value. This function gives the procedure a handler that gives
 * one value, and that throws when the real handler gives a stream.
 */

import type { ProcedureContext } from "../src/procedures/types.js";

type HandlerOf<P> = P extends { handler?: infer H } ? NonNullable<H> : never;
type InputOf<P> = HandlerOf<P> extends (input: infer I, ...rest: never[]) => unknown ? I : never;
type ValueOf<P> = HandlerOf<P> extends (...args: never[]) => infer R ? Exclude<Awaited<R>, AsyncGenerator<unknown, unknown, unknown>> : never;

/** The procedure with a handler that gives one value. */
export type ValueProcedure<P> = Omit<P, "handler"> & {
  handler: (input: InputOf<P>, ctx?: ProcedureContext) => Promise<ValueOf<P>>;
};

export function valueHandler<P extends { handler?: unknown }>(procedure: P): ValueProcedure<P> {
  const handler = procedure.handler as (input: unknown, ctx?: ProcedureContext) => unknown;
  return {
    ...procedure,
    handler: async (input: InputOf<P>, ctx?: ProcedureContext): Promise<ValueOf<P>> => {
      const output = await handler(input, ctx);
      if (output !== null && typeof output === "object" && Symbol.asyncIterator in output) {
        throw new Error("The handler gave a stream, not one value");
      }
      return output as ValueOf<P>;
    },
  } as ValueProcedure<P>;
}
