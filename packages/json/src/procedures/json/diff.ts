/**
 * json.diff procedure
 *
 * Give the RFC 6902 JSON Patch that changes one JSON value into another. `json.patch` with this
 * patch on `from` gives a value equal to `to`.
 */

import { diffJson } from "../../diff.js";
import { assertJson } from "../../value.js";
import type { JsonDiffInput, JsonDiffOutput } from "../../types.js";

/**
 * Give the RFC 6902 JSON Patch that changes one JSON value into another
 */
export async function jsonDiff(input: JsonDiffInput): Promise<JsonDiffOutput> {
  assertJson(input.from, "json.diff: from");
  assertJson(input.to, "json.diff: to");
  return { patch: diffJson(input.from, input.to) };
}
