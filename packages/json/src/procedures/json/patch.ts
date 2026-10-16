/**
 * json.patch procedure
 *
 * Apply an RFC 6902 JSON Patch to a JSON value. All operations apply or none. A failed `test`
 * operation is an error with the code `TEST_FAILED`.
 */

import { applyPatch } from "../../patch.js";
import { assertJson } from "../../value.js";
import type { JsonPatchInput, JsonPatchOutput } from "../../types.js";

/**
 * Apply an RFC 6902 JSON Patch to a JSON value
 */
export async function jsonPatch(input: JsonPatchInput): Promise<JsonPatchOutput> {
  assertJson(input.value, "json.patch: value");
  input.patch.forEach((operation, index) => {
    if (operation.value !== undefined) assertJson(operation.value, `json.patch: the value of operation ${index}`);
  });
  return { value: applyPatch(input.value, input.patch) };
}
