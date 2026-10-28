/**
 * The operands of the control-flow procedures, shared by `client.chain`, `client.conditional`
 * and the others, and by `client.eval` (`meta.ts`).
 */

import type { ProcedureContext, ProcedurePath } from "../types.js";
import { PROCEDURE_REGISTRY } from "../registry.js";
import {
  isAnyProcedureRef,
  isOutputRef,
  lookupOutputRef,
  rawInputRule,
  scopeOf,
  RUNS_REFS_TAG,
  type AnyProcedureRef,
  type RefScope,
} from "../ref.js";
import { hydrateInput, runControl, runOperand, type RunControlOptions } from "../program.js";

/**
 * The operands of a control-flow procedure arrive raw: the procedure runs them itself. Its logic
 * is a runner of the coeval kernel (`program.ts`): the handler gives its input to the kernel as a
 * document of its kind. The input of a control-flow procedure carries the scope of its caller
 * (`withScope`), so an operand can read the names of an outer chain, `map` or `reduce` (deep dive
 * CORE-13).
 */

/** The raw-input rule of the caller's registry: the procedure at a path decides (deep dive CORE-5). */
export function rawRule(ctx: ProcedureContext): (path: ProcedurePath) => boolean {
  return rawInputRule(ctx.registry ?? PROCEDURE_REGISTRY);
}

/** The call function of a context, as the executor of a run. */
function executorOf(ctx: ProcedureContext): <TIn, TOut>(path: ProcedurePath, input: TIn) => Promise<TOut> {
  return <TIn, TOut>(path: ProcedurePath, input: TIn): Promise<TOut> => ctx.client.call<TIn, TOut>(path, input);
}

/**
 * This function runs a control-flow procedure on the kernel: the runner of its kind runs the
 * operands of the input, in the scope of the caller. The observer in `options` gets the result of
 * each step of a chain (`client.trace`).
 */
export function runControlFlow(name: string, input: unknown, ctx: ProcedureContext, options: Pick<RunControlOptions, "onStep"> = {}): Promise<unknown> {
  return runControl(name, input, { executor: executorOf(ctx), rawInput: rawRule(ctx), onRef: ctx.onRef, scope: scopeOf(input), onStep: options.onStep });
}

/**
 * Without a client, a control-flow procedure cannot run refs. This function gives a value with
 * its known `$ref` values resolved. A name that the scope does not have stays as it is.
 */
export function substituteRefs(value: unknown, scope: RefScope): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (isOutputRef(value)) {
    const { found, value: resolved } = lookupOutputRef(value.$ref, scope);
    return found ? resolved : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteRefs(item, scope));
  }
  if (isAnyProcedureRef(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, substituteRefs(val, scope)]));
}

/**
 * This function gives the value of an operand that is not a ref: it resolves its `$ref` values
 * in `scope` and runs its nested refs, as `exec()` does for an input.
 */
export async function hydrateOperand(value: unknown, ctx: ProcedureContext, scope?: RefScope): Promise<unknown> {
  return hydrateInput(value, executorOf(ctx), { scope, rawInput: rawRule(ctx), onRef: ctx.onRef });
}

/**
 * This function runs an operand ref of a control-flow procedure (`runOperand()`).
 *
 * It resolves the `$ref` values of the ref's input in `scope`, runs the nested refs of the
 * input and adds `extra` (the parent context, for example `cwd`). Then it calls the procedure.
 * A procedure that takes its input raw (control flow) gets the input unchanged, with the scope:
 * that procedure runs its own operands. A `$never` operand is data with its full input.
 */
export async function callOperand(
  ref: AnyProcedureRef,
  ctx: ProcedureContext,
  options: { scope?: RefScope | undefined; extra?: Record<string, unknown> | undefined } = {},
): Promise<unknown> {
  return runOperand(ref, { executor: executorOf(ctx), rawInput: rawRule(ctx), onRef: ctx.onRef, scope: options.scope, extra: options.extra });
}

/** This function gives the value of any operand: a ref runs, another value is hydrated. */
export async function evaluateOperand(
  value: unknown,
  ctx: ProcedureContext,
  options: { scope?: RefScope | undefined; extra?: Record<string, unknown> | undefined } = {},
): Promise<unknown> {
  if (isAnyProcedureRef(value)) {
    return callOperand(value, ctx, options);
  }
  return hydrateOperand(value, ctx, options.scope);
}

/** The tags of a control-flow procedure: hydration gives it its input raw. */
export function controlFlowTags(...tags: string[]): string[] {
  return ["core", ...tags, RUNS_REFS_TAG];
}
