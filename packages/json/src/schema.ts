/**
 * The check of a JSON value against a JSON Schema (`json.validate`).
 *
 * The check uses the validator of `@procedures/compiler` (`checkShape`), the validator that
 * `program.check` uses for the inputs of a program. It is a subset of JSON Schema:
 *
 * - Examined: `type`, `enum`, `const`, `$ref` to the same schema (`#/...`), `allOf`, `anyOf`,
 *   `oneOf` (as `anyOf`), `properties`, `required`, `additionalProperties`, `patternProperties`,
 *   `items`, `prefixItems`, `additionalItems`, `minItems`, `maxItems`, `minLength`, `maxLength`,
 *   `pattern`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` and `multipleOf`.
 * - Annotations without a check, as the standard tells: `format`, `title`, `description`,
 *   `default`, `examples` and the other annotations.
 * - Not examined: `not`, `if`, `then`, `else`, `uniqueItems`, `contains`, `minProperties`,
 *   `maxProperties`, `propertyNames`, `dependentRequired`, `dependentSchemas`, `unevaluated*`, a
 *   `$ref` to another document, and the others of `NOT_EXAMINED`. The output lists them in
 *   `unchecked`, so a caller knows that the verdict is not complete.
 *
 * `minLength` and `maxLength` count UTF-16 code units, not code points.
 */

import { checkShape } from "@procedures/compiler";
import { isPlainObject, JsonError, type JsonValue } from "./value.js";

/** One problem of a value. */
export interface ValidationIssue {
  /** The JSON Pointer of the part of the value. */
  readonly pointer: string;
  readonly message: string;
}

/** The verdict of a check. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationIssue[];
  /** The keywords of the schema that the check does not examine, or examines only in part. */
  readonly unchecked: readonly string[];
}

/** The assertion keywords of JSON Schema that the subset does not examine. */
export const NOT_EXAMINED: readonly string[] = [
  "not",
  "if",
  "then",
  "else",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "minProperties",
  "maxProperties",
  "propertyNames",
  "dependentRequired",
  "dependentSchemas",
  "dependencies",
  "unevaluatedItems",
  "unevaluatedProperties",
  "$dynamicRef",
  "$recursiveRef",
  "nullable",
];

/** The keywords whose value is one schema. */
const ONE_SCHEMA = ["additionalProperties", "additionalItems", "items", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedItems", "unevaluatedProperties"];
/** The keywords whose value is a list of schemas. */
const SCHEMA_LIST = ["allOf", "anyOf", "oneOf", "prefixItems", "items"];
/** The keywords whose value is a map of schemas. */
const SCHEMA_MAP = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"];

/** The keywords of a schema and its subschemas that the check does not examine fully. */
function uncheckedKeywords(schema: unknown): string[] {
  const found = new Set<string>();
  const seen = new Set<object>();
  const visit = (node: unknown): void => {
    if (!isPlainObject(node) || seen.has(node)) return;
    seen.add(node);
    for (const keyword of Object.keys(node)) {
      if (NOT_EXAMINED.includes(keyword)) found.add(keyword);
    }
    if (node["oneOf"] !== undefined) found.add("oneOf (examined as anyOf)");
    const ref = node["$ref"];
    if (typeof ref === "string" && !(ref === "#" || ref.startsWith("#/"))) found.add(`$ref ${ref}`);
    for (const keyword of ONE_SCHEMA) visit(node[keyword]);
    for (const keyword of SCHEMA_LIST) {
      const list = node[keyword];
      if (Array.isArray(list)) list.forEach(visit);
    }
    for (const keyword of SCHEMA_MAP) {
      const map = node[keyword];
      if (isPlainObject(map)) Object.values(map).forEach(visit);
    }
  };
  visit(schema);
  return [...found].sort();
}

/** This function examines a JSON value against a JSON Schema. A schema that is not an object or a boolean throws. */
export function validateJson(value: JsonValue, schema: unknown): ValidationResult {
  if (typeof schema !== "boolean" && !isPlainObject(schema)) {
    throw new JsonError("INVALID_SCHEMA", "json.validate: the schema is not an object or a boolean");
  }
  const issues = checkShape({ kind: "known", value, pointer: "" }, schema);
  const errors = issues.map((issue) => ({ pointer: issue.pointer, message: issue.message }));
  return { valid: errors.length === 0, errors, unchecked: uncheckedKeywords(schema) };
}
