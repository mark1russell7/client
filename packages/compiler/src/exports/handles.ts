/**
 * The handles of an exports manifest (d40-handles). An instance of a class is not JSON. The
 * generator gives the schema of a handle to a parameter or an output with such a type. The loader
 * keeps the object of an output in the handle scope of the caller. It gets the object of an input
 * from the same scope.
 */

import type { Effects } from "@procedures/client/browser";
import { HANDLE_KEYWORD } from "@procedures/client/browser";
import type { ExportsJsonSchema } from "./types.js";

/**
 * This function gives the kinds of a handle schema, or undefined for another schema. An input of an
 * interface can take more than one kind. A schema of `T | null` has the handle schema in `anyOf`.
 */
export function handleKindsOf(schema: ExportsJsonSchema | undefined): readonly string[] | undefined {
  if (schema === undefined) return undefined;
  const own = kindsOf(schema[HANDLE_KEYWORD]);
  if (own !== undefined) return own;
  const members = schema["anyOf"];
  if (!Array.isArray(members)) return undefined;
  for (const member of members as ExportsJsonSchema[]) {
    const kinds = kindsOf(member[HANDLE_KEYWORD]);
    if (kinds !== undefined) return kinds;
  }
  return undefined;
}

/** The kinds of the value of the keyword: a kind, or a list of kinds. */
function kindsOf(value: unknown): readonly string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.length > 0 && value.every((kind) => typeof kind === "string")) return value as string[];
  return undefined;
}

/**
 * This function gives the effects of a procedure with handles. A procedure that takes a handle
 * reads the scope `handles`, and a procedure that gives a handle writes it. Unknown effects stay unknown.
 */
export function withHandleEffects(effects: Effects | undefined, takes: boolean, gives: boolean): Effects | undefined {
  if (effects === undefined || (!takes && !gives)) return effects;
  const add = (names: readonly string[] | undefined, more: boolean): readonly string[] | undefined =>
    more ? [...new Set([...(names ?? []), "handles"])] : names;
  const reads = add(effects.reads, takes);
  const writes = add(effects.writes, gives);
  return { ...effects, ...(reads !== undefined ? { reads } : {}), ...(writes !== undefined ? { writes } : {}) };
}
