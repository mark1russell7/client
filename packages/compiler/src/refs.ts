/**
 * The test of a `$ref` object, as `isOutputRef()` of the client has it (the browser entry of the
 * client does not export that function).
 */

/** True for an object with a `$ref` string (also an inherited one, as the `in` test of the client). */
export function isOutputRef(value: unknown): value is { readonly $ref: string } {
  return typeof value === "object" && value !== null && "$ref" in value && typeof (value as { $ref?: unknown }).$ref === "string";
}
