/**
 * The three-way merge of JSON values. Two sides changed one base, and the merge joins the two
 * changes. The merge has no policy: it gives the merged value and the list of its conflicts as
 * data. The caller decides what a conflict means.
 *
 * - When the two sides are equal, the result is that value.
 * - When one side equals the base, the result is the other side.
 * - When all three differ, two objects merge key by key. The base of the keys is the base object,
 *   or nothing when the base has no value at that place.
 * - Other values that all differ are a conflict. An array is one value: it merges whole, with no
 *   merge of its items.
 *
 * `undefined` means "no value": a key that an object does not have, or a whole value that does not
 * exist. `null` is a value. A removal on one side and a change on the other side is a conflict.
 *
 * At a conflict, the merged value holds the value of `ours`. Each conflict gives the three values.
 *
 * Each object that this function makes has own data properties only, so a key `__proto__` of the
 * data stays data.
 */

import { assertJson, cloneJson, formatPointer, hasOwn, isPlainObject, jsonEqual, put, type JsonValue } from "./value.js";

/** One place where the two sides changed the base in different ways. */
export interface ThreeWayConflict {
  /** The JSON Pointer of the place. The root is the empty string. */
  readonly path: string;
  /** The value of the base at this place, or `undefined` when it has none. */
  readonly base: JsonValue | undefined;
  /** The value of `ours` at this place, or `undefined` when it has none. */
  readonly ours: JsonValue | undefined;
  /** The value of `theirs` at this place, or `undefined` when it has none. */
  readonly theirs: JsonValue | undefined;
}

/** The result of `mergeThreeWay`. */
export interface ThreeWayResult {
  /** The merged value. It holds the value of `ours` at each conflict. `undefined`: no value. */
  readonly merged: JsonValue | undefined;
  /** The conflicts, in the order of the keys of the merge. The list is empty for a clean merge. */
  readonly conflicts: readonly ThreeWayConflict[];
}

type Side = JsonValue | undefined;
type JsonObject = Record<string, JsonValue>;

function same(a: Side, b: Side): boolean {
  if (a === undefined || b === undefined) return a === b;
  return jsonEqual(a, b);
}

function copy(value: Side): Side {
  return value === undefined ? undefined : cloneJson(value);
}

function memberOf(value: Side, key: string): Side {
  return isPlainObject(value) && hasOwn(value, key) ? (value as JsonObject)[key] : undefined;
}

function mergeAt(base: Side, ours: Side, theirs: Side, tokens: string[], conflicts: ThreeWayConflict[]): Side {
  if (same(ours, theirs) || same(base, theirs)) return copy(ours);
  if (same(base, ours)) return copy(theirs);
  if (isPlainObject(ours) && isPlainObject(theirs) && (base === undefined || isPlainObject(base))) {
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(ours), ...Object.keys(theirs)]);
    for (const key of [...keys].sort()) {
      const member = mergeAt(memberOf(base, key), memberOf(ours, key), memberOf(theirs, key), [...tokens, key], conflicts);
      if (member !== undefined) put(result, key, member);
    }
    return result as JsonObject;
  }
  conflicts.push({ path: formatPointer(tokens), base: copy(base), ours: copy(ours), theirs: copy(theirs) });
  return copy(ours);
}

/**
 * This function merges the changes of `ours` and `theirs` over `base`. It changes none of its
 * inputs, and the result shares no object with them.
 *
 * Laws: `base` equal to `ours` gives `theirs`. `base` equal to `theirs` gives `ours`. `ours` equal
 * to `theirs` gives that value. Each of these has no conflict. A swap of the two sides gives
 * conflicts at the same paths.
 *
 * @throws JsonError when an input that is not `undefined` is not a JSON value.
 */
export function mergeThreeWay(base: JsonValue | undefined, ours: JsonValue | undefined, theirs: JsonValue | undefined): ThreeWayResult {
  if (base !== undefined) assertJson(base, "base");
  if (ours !== undefined) assertJson(ours, "ours");
  if (theirs !== undefined) assertJson(theirs, "theirs");
  const conflicts: ThreeWayConflict[] = [];
  const merged = mergeAt(base, ours, theirs, [], conflicts);
  return { merged, conflicts };
}
