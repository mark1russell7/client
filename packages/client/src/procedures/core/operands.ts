/**
 * The operands of the control-flow procedures, shared by `client.chain`, `client.conditional`
 * and the others, and by `client.eval` (`meta.ts`).
 */

import type { ProcedureContext, ProcedurePath } from "../types.js";
import { PROCEDURE_REGISTRY } from "../registry.js";
import {
  isAnyProcedureRef,
  normalizeRef,
  hydrateInput,
  createRefScope,
  isOutputRef,
  lookupOutputRef,
  rawInputRule,
  withScope,
  RUNS_REFS_TAG,
  type AnyProcedureRef,
  type RefScope,
} from "../ref.js";

/**
 * The operands of a control-flow procedure arrive raw: the procedure runs them itself, with the
 * same rules as `exec()` (one interpreter, `hydrateInput`). The input of a control-flow procedure
 * carries the scope of its caller (`withScope`), so an operand can read the names of an outer
 * chain, `map` or `reduce` (deep dive CORE-13).
 */

/** The raw-input rule of the caller's registry: the procedure at a path decides (deep dive CORE-5). */
export function rawRule(ctx: ProcedureContext): (path: ProcedurePath) => boolean {
  return rawInputRule(ctx.registry ?? PROCEDURE_REGISTRY);
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
  return hydrateInput(value, (path, input) => ctx.client.call(path, input), { scope, rawInput: rawRule(ctx), onRef: ctx.onRef });
}

/**
 * This function runs an operand ref of a control-flow procedure.
 *
 * It resolves the `$ref` values of the ref's input in `scope`, runs the nested refs of the
 * input and adds `extra` (the parent context, for example `cwd`). Then it calls the procedure.
 * A procedure that takes its input raw (control flow) gets the input unchanged, with the scope:
 * that procedure runs its own operands.
 */
export async function callOperand(
  ref: AnyProcedureRef,
  ctx: ProcedureContext,
  options: { scope?: RefScope | undefined; extra?: Record<string, unknown> | undefined } = {},
): Promise<unknown> {
  const normalized = normalizeRef(ref);
  const raw = rawRule(ctx)(normalized.path);
  let input: unknown = raw ? normalized.input : await hydrateOperand(normalized.input, ctx, options.scope);
  const extra = options.extra ?? {};
  if (Object.keys(extra).length > 0) {
    input = { ...(typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}), ...extra };
  }
  if (raw) {
    input = withScope(input, options.scope);
  }
  return ctx.client.call(normalized.path, input);
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

/** The parent context that the control-flow procedures give to their operands. */
export function parentContext(input: { cwd?: string | undefined; node?: unknown }): Record<string, unknown> {
  return {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.node ? { node: input.node } : {}),
  };
}

/** A child scope of `parent` with the given `$ref` names, for one call of `fn`. */
export function scopeWith(values: Record<string, unknown>, parent?: RefScope): RefScope {
  const scope = createRefScope(parent);
  for (const [name, value] of Object.entries(values)) scope.outputs.set(name, value);
  return scope;
}

/** The tags of a control-flow procedure: hydration gives it its input raw. */
export function controlFlowTags(...tags: string[]): string[] {
  return ["core", ...tags, RUNS_REFS_TAG];
}
