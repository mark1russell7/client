/**
 * An input schema for a runner: a procedure that takes its input raw and runs the procedure
 * refs in it (`core.catch`, `dag.traverse`).
 *
 * The caller gives a raw input with its scope (`withScope()`), so the runner can resolve the
 * `$ref` names of an outer chain. The scope is a hidden property, and a Zod parse makes a new
 * object without it. This schema validates with Zod, then puts the scope of the input on the
 * result. (The general fix is in the core: `invokeProcedure` could keep the scope across the
 * validation of every procedure.)
 */

import { scopeOf, withScope, zodAdapter, type ZodLikeSchema } from "@mark1russell7/client";

export function scopedInput<T>(schema: { parse: (data: unknown) => T; _def?: unknown; shape?: unknown }): ZodLikeSchema<T> {
  const scoped: { parse: (data: unknown) => T; _def?: unknown; shape?: unknown } = {
    parse: (data: unknown) => withScope(schema.parse(data), scopeOf(data)),
  };
  // zodAdapter shows _def and shape, so the CLI help and the MCP schema still see the fields
  if (schema._def !== undefined) scoped._def = schema._def;
  if (schema.shape !== undefined) scoped.shape = schema.shape;
  return zodAdapter<T>(scoped);
}
