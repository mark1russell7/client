/**
 * json.merge procedure
 *
 * Apply an RFC 7386 JSON merge patch to a JSON value. A member with the value null removes its
 * key. A patch that is not an object replaces the value.
 */

import { mergePatch } from "../../merge.js";
import { assertJson } from "../../value.js";
import type { JsonMergeInput, JsonMergeOutput } from "../../types.js";

/**
 * Apply an RFC 7386 JSON merge patch to a JSON value
 */
export async function jsonMerge(input: JsonMergeInput): Promise<JsonMergeOutput> {
  assertJson(input.target, "json.merge: target");
  assertJson(input.patch, "json.merge: patch");
  return { value: mergePatch(input.target, input.patch) };
}
