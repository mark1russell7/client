/**
 * JSON Merge Patch (RFC 7386): a patch is a JSON value of the same form as the target.
 *
 * - A patch that is an object changes the target member by member. A member with the value null
 *   removes the key. Another member merges into the key.
 * - A patch that is not an object replaces the target.
 *
 * The merge applies to a copy of the target. A key `__proto__`, `constructor` or `prototype` in
 * an object of the patch is refused (roadmap R6).
 */

import { cloneJson, formatPointer, hasOwn, isPlainObject, JsonError, PROTOTYPE_KEYS, put, type JsonValue } from "./value.js";

function mergeAt(target: JsonValue | undefined, patch: JsonValue, tokens: string[]): JsonValue {
  if (!isPlainObject(patch)) return cloneJson(patch);
  const result: Record<string, JsonValue> = isPlainObject(target) ? cloneJson(target as Record<string, JsonValue>) : {};
  for (const key of Object.keys(patch)) {
    if (PROTOTYPE_KEYS.has(key)) {
      throw new JsonError("PROTOTYPE_KEY", `The merge patch has the key "${key}" at "${formatPointer([...tokens, key])}", which reaches a prototype`);
    }
    const value = patch[key] as JsonValue;
    if (value === null) {
      delete result[key];
    } else {
      put(result, key, mergeAt(hasOwn(result, key) ? result[key] : undefined, value, [...tokens, key]));
    }
  }
  return result;
}

/** This function applies a JSON merge patch to a copy of the target and gives the result. */
export function mergePatch(target: JsonValue, patch: JsonValue): JsonValue {
  return mergeAt(target, patch, []);
}
