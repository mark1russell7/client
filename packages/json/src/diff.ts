/**
 * The diff of two JSON values: a JSON Patch (RFC 6902) that changes the first value into the
 * second value. `applyPatch(a, diffJson(a, b))` gives a value equal to `b`.
 *
 * - Two objects: a `remove` for each key that only the first has, a diff of each shared key, and
 *   an `add` for each key that only the second has.
 * - Two arrays: the items of the shared start and end stay. The items between them get a diff
 *   for each shared position, then a `remove` or an `add` for each other item.
 * - Other values: one `replace`.
 *
 * The patch never names `__proto__`, `constructor` or `prototype`, because `applyPatch` refuses
 * them. When a difference is under such a key, the patch replaces the object that holds the key.
 */

import type { PatchOperation } from "./patch.js";
import { cloneJson, formatPointer, hasOwn, jsonEqual, PROTOTYPE_KEYS, type JsonValue } from "./value.js";

function diffAt(a: JsonValue, b: JsonValue, tokens: (string | number)[], out: PatchOperation[]): void {
  if (jsonEqual(a, b)) return;
  const path = formatPointer(tokens);
  if (Array.isArray(a) && Array.isArray(b)) {
    diffArrays(a, b, tokens, out);
    return;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const named = [...keysA, ...keysB].some((key) => PROTOTYPE_KEYS.has(key) && !(hasOwn(a, key) && hasOwn(b, key) && jsonEqual(a[key]!, b[key]!)));
    if (!named) {
      for (const key of keysA) if (!hasOwn(b, key)) out.push({ op: "remove", path: formatPointer([...tokens, key]) });
      for (const key of keysA) if (hasOwn(b, key)) diffAt(a[key]!, b[key]!, [...tokens, key], out);
      for (const key of keysB) if (!hasOwn(a, key)) out.push({ op: "add", path: formatPointer([...tokens, key]), value: cloneJson(b[key]!) });
      return;
    }
  }
  out.push({ op: "replace", path, value: cloneJson(b) });
}

function diffArrays(a: JsonValue[], b: JsonValue[], tokens: (string | number)[], out: PatchOperation[]): void {
  let start = 0;
  while (start < a.length && start < b.length && jsonEqual(a[start]!, b[start]!)) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && jsonEqual(a[a.length - 1 - end]!, b[b.length - 1 - end]!)) end++;
  const middleA = a.length - start - end;
  const middleB = b.length - start - end;
  const shared = Math.min(middleA, middleB);
  for (let i = 0; i < shared; i++) diffAt(a[start + i]!, b[start + i]!, [...tokens, start + i], out);
  // The items after the shared positions: remove from the last one, so each index stays valid
  for (let i = middleA - 1; i >= shared; i--) out.push({ op: "remove", path: formatPointer([...tokens, start + i]) });
  for (let i = shared; i < middleB; i++) out.push({ op: "add", path: formatPointer([...tokens, start + i]), value: cloneJson(b[start + i]!) });
}

/** This function gives a JSON Patch that changes `a` into `b`. Equal values give an empty patch. */
export function diffJson(a: JsonValue, b: JsonValue): PatchOperation[] {
  const out: PatchOperation[] = [];
  diffAt(a, b, [], out);
  return out;
}
