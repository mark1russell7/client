/**
 * The fields of a procedure input, as a command line sees them.
 *
 * This module reads the field types of an input schema from its JSON Schema, converts the text of
 * the command line to those types, and merges repeated values. The schema validates the result.
 */

import { jsonSchemaOf, type ProcedureSchema } from "@procedures/client";

/**
 * CLI metadata that can be attached to procedures via .meta()
 */
export interface CLIMeta {
  /** Description for help text */
  description?: string;
  /** Field names that are positional args (in order). An array field that is last takes the rest. */
  args?: string[];
  /** Short flag mappings: { fieldName: "f" } */
  shorts?: Record<string, string>;
  /** Output format hint */
  output?: "text" | "json" | "table" | "streaming";
  /** Whether to prompt for missing required fields */
  interactive?: boolean;
}

/**
 * The kinds of field the CLI can convert to. "any" is a field with no usable type: its value is
 * JSON when it parses as JSON, and text otherwise.
 */
export type FieldKind =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "enum"
  | "literal"
  | "date"
  | "array"
  | "record"
  | "object"
  | "union"
  | "any";

/**
 * The type of a schema field, as the CLI sees it
 */
export interface FieldType {
  kind: FieldKind;
  /** The item type of an array */
  item?: FieldType;
  /** The value type of a record */
  value?: FieldType;
  /** The member types of a union */
  options?: FieldType[];
  /** The values of an enum */
  values?: readonly string[];
  /** The value of a literal */
  literal?: unknown;
}

/**
 * Extracted schema field info for help generation
 */
export interface SchemaFieldInfo {
  name: string;
  /** The display name of the type, for the help text */
  type: string;
  /** The type the CLI converts values to */
  fieldType: FieldType;
  required: boolean;
  description: string | undefined;
  defaultValue: unknown;
  enumValues: readonly string[] | undefined;
}

/**
 * A JSON Schema node, as `jsonSchemaOf()` of the core gives it (draft-07).
 */
interface JsonNode {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  items?: JsonNode | JsonNode[];
  properties?: Record<string, JsonNode>;
  required?: string[];
  additionalProperties?: boolean | JsonNode;
  anyOf?: JsonNode[];
  oneOf?: JsonNode[];
  allOf?: JsonNode[];
}

/** True for the JSON Schema of `null` (a nullable field is `anyOf: [T, null]`). */
function isNull(node: JsonNode): boolean {
  return node.type === "null" || (node.const === null && node.type === undefined);
}

/** The members of a union, without `null` (a nullable value is the type itself on the CLI). */
function unionMembers(node: JsonNode): JsonNode[] | undefined {
  const members = node.anyOf ?? node.oneOf;
  return members?.filter((member) => !isNull(member));
}

/**
 * The CLI type of a JSON Schema node.
 */
function fieldTypeOfJson(node: JsonNode | undefined): FieldType {
  if (!node || typeof node !== "object") {
    return { kind: "any" };
  }
  const members = unionMembers(node);
  if (members) {
    if (members.length === 1) return fieldTypeOfJson(members[0]);
    // A union of string constants is an enum on the CLI
    if (members.length > 1 && members.every((member) => typeof member.const === "string")) {
      return { kind: "enum", values: members.map((member) => member.const as string) };
    }
    return { kind: "union", options: members.map((member) => fieldTypeOfJson(member)) };
  }
  if (node.allOf?.length === 1) {
    return fieldTypeOfJson(node.allOf[0]);
  }
  if (Array.isArray(node.enum)) {
    return node.enum.every((value) => typeof value === "string")
      ? { kind: "enum", values: node.enum as string[] }
      : { kind: "any" };
  }
  if ("const" in node && node.const !== undefined) {
    return { kind: "literal", literal: node.const };
  }
  const types = Array.isArray(node.type) ? node.type.filter((type) => type !== "null") : node.type ? [node.type] : [];
  if (types.length > 1) {
    return { kind: "union", options: types.map((type) => fieldTypeOfJson({ ...node, type })) };
  }
  switch (types[0]) {
    case "string":
      return node.format === "date-time" || node.format === "date" ? { kind: "date" } : { kind: "string" };
    case "number":
    case "integer":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "array":
      return { kind: "array", item: fieldTypeOfJson(Array.isArray(node.items) ? undefined : node.items) };
    case "object": {
      const extra = node.additionalProperties;
      const hasFields = node.properties && Object.keys(node.properties).length > 0;
      if (!hasFields && extra && typeof extra === "object") {
        return { kind: "record", value: fieldTypeOfJson(extra) };
      }
      return { kind: "object" };
    }
    default:
      return { kind: "any" };
  }
}

/**
 * The JSON Schema of a procedure schema (or a JSON Schema itself, as the manifest stores it).
 */
function asJsonSchema(schema: unknown): JsonNode | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  // A JSON Schema already (from the manifest): it has no validator
  const props = schema as Record<string, unknown>;
  if (!("~standard" in props) && typeof props["safeParse"] !== "function" && typeof props["parse"] !== "function") {
    return schema as JsonNode;
  }
  return jsonSchemaOf(schema as ProcedureSchema) as JsonNode | undefined;
}

/**
 * The CLI type of a schema: a procedure schema (a Standard Schema such as zod 4) or its JSON
 * Schema. The type comes from the JSON Schema, so every schema library works. (Before, the
 * parser read the private fields of zod 3.)
 */
export function fieldTypeOf(schema: unknown): FieldType {
  return fieldTypeOfJson(asJsonSchema(schema));
}

/**
 * The display name of a type, for the help text
 */
export function typeName(type: FieldType): string {
  switch (type.kind) {
    case "array":
      return `${typeName(type.item ?? { kind: "any" })}[]`;
    case "record":
      return "key=value";
    case "object":
    case "any":
      return "json";
    case "union":
      return (type.options ?? []).map(typeName).join("|");
    case "literal":
      return JSON.stringify(type.literal);
    default:
      return type.kind;
  }
}

/**
 * Extract field information from a schema: a procedure schema or its JSON Schema. A schema that
 * is not an object (or that has no JSON Schema) gives no fields: the CLI then passes its flags
 * through.
 */
export function extractSchemaFields(schema: unknown): SchemaFieldInfo[] {
  const json = asJsonSchema(schema);
  const object = json && !json.properties ? unionMembers(json)?.find((member) => member.properties) : json;
  if (!object?.properties) {
    return [];
  }
  const required = new Set(object.required ?? []);
  const fields: SchemaFieldInfo[] = [];
  for (const [name, field] of Object.entries(object.properties)) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const fieldType = fieldTypeOfJson(field);
    const description = field.description ?? unionMembers(field)?.find((member) => member.description)?.description;
    fields.push({
      name,
      type: fieldType.kind === "enum" ? "enum" : typeName(fieldType),
      fieldType,
      required: required.has(name) && field.default === undefined,
      description,
      defaultValue: field.default,
      enumValues: fieldType.kind === "enum" ? fieldType.values : undefined,
    });
  }
  return fields;
}

// =============================================================================
// Conversion of CLI text to the field types
// =============================================================================

/** The result of a conversion: the value, or a message for the user */
export type Converted = { ok: true; value: unknown } | { ok: false; error: string };

// The digits before the point and the digits after it are two groups, so each text has one match
const NUMBER_TEXT = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$|^0[xX][0-9a-fA-F]+$/;
const SAFE_INTEGER_LIMIT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Text as a JSON value, when it is JSON. A whole number that a JavaScript number cannot hold
 * exactly stays text. Anything that is not JSON stays text.
 */
function jsonOrText(text: string): unknown {
  const trimmed = text.trim();
  if (/^-?\d+$/.test(trimmed)) {
    const big = BigInt(trimmed);
    if (big > SAFE_INTEGER_LIMIT || big < -SAFE_INTEGER_LIMIT) {
      return text;
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

/**
 * Convert the CLI text of one value to a field type
 */
export function convertValue(text: string, type: FieldType, label: string): Converted {
  switch (type.kind) {
    case "string":
    case "date":
      return { ok: true, value: text };
    case "enum":
      return { ok: true, value: text };
    case "number": {
      if (!NUMBER_TEXT.test(text.trim())) {
        return { ok: false, error: `${label} needs a number, not "${text}"` };
      }
      return { ok: true, value: Number(text) };
    }
    case "bigint":
      try {
        return { ok: true, value: BigInt(text) };
      } catch {
        return { ok: false, error: `${label} needs a whole number, not "${text}"` };
      }
    case "boolean":
      if (text === "true") return { ok: true, value: true };
      if (text === "false") return { ok: true, value: false };
      return { ok: false, error: `${label} needs true or false, not "${text}"` };
    case "literal": {
      const literal = type.literal;
      if (typeof literal === "number") return convertValue(text, { kind: "number" }, label);
      if (typeof literal === "boolean") return convertValue(text, { kind: "boolean" }, label);
      return { ok: true, value: text };
    }
    case "array": {
      const item = type.item ?? { kind: "any" };
      if (text.trimStart().startsWith("[")) {
        const parsed = jsonOrText(text);
        if (Array.isArray(parsed)) {
          return { ok: true, value: parsed };
        }
      }
      const converted = convertValue(text, item, label);
      return converted.ok ? { ok: true, value: [converted.value] } : converted;
    }
    case "record": {
      if (text.trimStart().startsWith("{")) {
        const parsed = jsonOrText(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { ok: true, value: parsed };
        }
        return { ok: false, error: `${label} needs key=value or a JSON object` };
      }
      const eq = text.indexOf("=");
      if (eq <= 0) {
        return { ok: false, error: `${label} needs key=value, not "${text}"` };
      }
      const converted = convertValue(text.slice(eq + 1), type.value ?? { kind: "any" }, label);
      return converted.ok ? { ok: true, value: { [text.slice(0, eq)]: converted.value } } : converted;
    }
    case "object": {
      const parsed = jsonOrText(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, value: parsed };
      }
      return { ok: false, error: `${label} needs a JSON object, not "${text}"` };
    }
    case "union": {
      const options = type.options ?? [];
      // Zod tries the members in order: a member that takes text takes the text as it is
      for (const option of options) {
        if (option.kind === "string" || option.kind === "date") return { ok: true, value: text };
        if (option.kind === "enum" && option.values?.includes(text)) return { ok: true, value: text };
        if (option.kind === "literal" && String(option.literal) === text) {
          return { ok: true, value: option.literal };
        }
      }
      for (const option of options) {
        if (option.kind === "enum" || option.kind === "literal") continue;
        const converted = convertValue(text, option, label);
        if (converted.ok) return converted;
      }
      return { ok: true, value: jsonOrText(text) };
    }
    case "any":
    default:
      return { ok: true, value: jsonOrText(text) };
  }
}

/**
 * Add a converted value to a field that already has one. Arrays collect and records merge,
 * so a repeated flag adds to the field. Other fields take the last value.
 */
export function mergeValue(previous: unknown, next: unknown, type: FieldType): unknown {
  if (previous === undefined) {
    return next;
  }
  if (type.kind === "array" && Array.isArray(previous) && Array.isArray(next)) {
    return [...previous, ...next];
  }
  if (
    type.kind === "record" &&
    previous && typeof previous === "object" && !Array.isArray(previous) &&
    next && typeof next === "object" && !Array.isArray(next)
  ) {
    return { ...previous, ...next };
  }
  return next;
}

/**
 * Convert camelCase to kebab-case
 */
export function toKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 */
export function toCamel(str: string): string {
  return str.replace(/-([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * A command as the command line sees it: a procedure of a registry (with its input schema), or a
 * description of a procedure (with the fields of its input), for example the manifest of `mark`.
 */
export interface CommandLike {
  path: readonly string[];
  metadata?: unknown;
  /** The input schema of a procedure of the registry */
  input?: unknown;
  /** The output schema of a procedure of the registry */
  output?: unknown;
  /** The fields of the input of a description */
  fields?: readonly SchemaFieldInfo[];
  /** The fields of the result of a description */
  resultFields?: readonly SchemaFieldInfo[];
}

/** This function gives the fields of the input of a command: from its description, or read from its schema. */
export function fieldsOf(command: CommandLike): SchemaFieldInfo[] {
  return command.fields ? [...command.fields] : extractSchemaFields(command.input);
}

/**
 * The fields of the result of a procedure, from its output schema: only for a result that is an
 * object (a union, a stream item or a pass-through schema gives none).
 */
export function resultFieldsOfSchema(output: unknown): SchemaFieldInfo[] {
  const json = output ? (jsonSchemaOf(output as ProcedureSchema, { io: "output" }) as JsonNode | undefined) : undefined;
  if (!json) return [];
  if (json.type === "object") return extractSchemaFields(json);
  // A number, a string, a boolean or an array: the help shows the one value
  if (typeof json.type === "string" && ["number", "integer", "string", "boolean", "array"].includes(json.type)) {
    const fieldType = fieldTypeOfJson(json);
    return [
      {
        name: "value",
        type: typeName(fieldType),
        fieldType,
        required: true,
        description: json.description,
        defaultValue: undefined,
        enumValues: undefined,
      },
    ];
  }
  return [];
}

/** This function gives the fields of the result of a command: from its description, or read from its output schema. */
export function resultFieldsOf(command: CommandLike): SchemaFieldInfo[] {
  return command.resultFields ? [...command.resultFields] : resultFieldsOfSchema(command.output);
}

/** A field that only the metadata names (the schema has no readable shape) */
export function fieldWithoutSchema(name: string): SchemaFieldInfo {
  return {
    name,
    type: "json",
    fieldType: { kind: "any" },
    required: false,
    description: undefined,
    defaultValue: undefined,
    enumValues: undefined,
  };
}
