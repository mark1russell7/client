/**
 * json.validate procedure
 *
 * Examine a JSON value against a JSON Schema. The check is a subset of JSON Schema (see
 * `schema.ts`): `unchecked` lists the keywords of the schema that the check does not examine.
 */

import { validateJson } from "../../schema.js";
import { assertJson } from "../../value.js";
import type { JsonValidateInput, JsonValidateOutput } from "../../types.js";

/**
 * Examine a JSON value against a JSON Schema
 */
export async function jsonValidate(input: JsonValidateInput): Promise<JsonValidateOutput> {
  assertJson(input.value, "json.validate: value");
  assertJson(input.schema, "json.validate: schema");
  const result = validateJson(input.value, input.schema);
  return { valid: result.valid, errors: [...result.errors], unchecked: [...result.unchecked] };
}
