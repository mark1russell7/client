/**
 * The JSON Schema of `llm.structured`: the schema that the API gets, and the parse of an answer.
 *
 * The structured outputs of the API support a subset of JSON Schema. The API refuses the
 * numerical constraints, the string lengths, the array constraints and an `additionalProperties`
 * other than `false`. `constrainedSchema()` removes those keywords, as the Anthropic SDKs do. The
 * procedure examines the full schema after the answer, so the removed keywords still apply.
 */

/** The keywords that the structured outputs of the API do not support. */
export const UNSUPPORTED_KEYWORDS: readonly string[] = Object.freeze([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "minProperties",
  "maxProperties",
]);

/** The keywords whose value is one schema. */
const ONE_SCHEMA = ["items", "additionalItems", "not", "if", "then", "else", "propertyNames"];
/** The keywords whose value is a list of schemas. */
const SCHEMA_LIST = ["anyOf", "allOf", "oneOf", "prefixItems", "items"];
/** The keywords whose value is a map of schemas. */
const SCHEMA_MAP = ["properties", "patternProperties", "$defs", "definitions"];

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** True when a schema describes an object. */
function isObjectSchema(schema: Record<string, unknown>): boolean {
  const type = schema["type"];
  return type === "object" || (Array.isArray(type) && type.includes("object")) || (type === undefined && isRecord(schema["properties"]));
}

/**
 * This function gives a copy of a schema for the structured outputs of the API: without the
 * unsupported keywords, and with `additionalProperties: false` on each object. Without its
 * constraints, the copy can accept a value that the full schema refuses. Thus the procedure
 * examines each answer against the full schema.
 */
export function constrainedSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(constrainedSchema);
  if (!isRecord(schema)) return schema;
  const copy: Record<string, unknown> = {};
  for (const [keyword, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.includes(keyword)) continue;
    if (SCHEMA_MAP.includes(keyword) && isRecord(value)) {
      copy[keyword] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, constrainedSchema(sub)]));
    } else if (SCHEMA_LIST.includes(keyword) || ONE_SCHEMA.includes(keyword)) {
      copy[keyword] = constrainedSchema(value);
    } else {
      copy[keyword] = value;
    }
  }
  if (isObjectSchema(copy)) copy["additionalProperties"] = false;
  return copy;
}

/** The result of the parse of an answer. */
export type ParsedAnswer = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly problem: string };

/**
 * This function parses the text of an answer as one JSON value. It removes a code fence around
 * the value (` ```json ... ``` `), because a model can add one without the constraint.
 */
export function parseAnswer(text: string): ParsedAnswer {
  let body = text.trim();
  const fence = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(body);
  if (fence) body = fence[1]!.trim();
  if (body === "") return { ok: false, problem: "the answer is empty" };
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch (error) {
    return { ok: false, problem: `the answer is not JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}
