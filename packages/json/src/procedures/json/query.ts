/**
 * json.query procedure
 *
 * Find the values at a JSON Pointer or a path in a JSON value. A pointer gives one match or none.
 * A path query can give more matches, in document order. Each match has its JSON Pointer.
 */

import { queryPath } from "../../path.js";
import { lookup, parsePointer } from "../../pointer.js";
import { assertJson, formatPointer, JsonError } from "../../value.js";
import type { JsonQueryInput, JsonQueryOutput } from "../../types.js";

/**
 * Find the values at a JSON Pointer or a path in a JSON value
 */
export async function jsonQuery(input: JsonQueryInput): Promise<JsonQueryOutput> {
  assertJson(input.value, "json.query: value");
  if ((input.pointer === undefined) === (input.path === undefined)) {
    throw new JsonError("INVALID_POINTER", "json.query: give one of pointer and path");
  }
  if (input.pointer !== undefined) {
    const tokens = parsePointer(input.pointer);
    const found = lookup(input.value, tokens);
    if (!found.found) return { found: false, matches: [] };
    return { found: true, value: found.value, matches: [{ pointer: formatPointer(tokens), value: found.value }] };
  }
  const matches = queryPath(input.value, input.path!).map((match) => ({ pointer: formatPointer(match.tokens), value: match.value }));
  return matches.length === 0 ? { found: false, matches } : { found: true, value: matches[0]!.value, matches };
}
