/**
 * Schema-based CLI Argument Parser
 *
 * Reads the field types of a procedure's input schema, converts CLI text to those types, and
 * makes the help text. Validation is delegated to the procedure's schema.
 */

import { CLI_GLOBAL_FLAGS } from "@mark1russell7/client-lib/cli-flags";

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
 * Zod-like schema shape for introspection (Zod 3)
 */
interface ZodNode {
  _def?: {
    typeName?: string;
    description?: string;
    shape?: () => Record<string, ZodNode>;
    innerType?: ZodNode;
    schema?: ZodNode;
    type?: ZodNode;
    in?: ZodNode;
    getter?: () => ZodNode;
    defaultValue?: () => unknown;
    values?: readonly string[] | Record<string, string | number>;
    value?: unknown;
    valueType?: ZodNode;
    options?: readonly ZodNode[] | Map<unknown, ZodNode>;
  };
  shape?: Record<string, ZodNode>;
  description?: string;
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

/** The wrappers that do not change what the CLI must give */
const WRAPPERS = new Set([
  "ZodOptional",
  "ZodNullable",
  "ZodDefault",
  "ZodEffects",
  "ZodBranded",
  "ZodCatch",
  "ZodReadonly",
  "ZodPipeline",
  "ZodLazy",
]);

interface Unwrapped {
  node: ZodNode;
  required: boolean;
  defaultValue: unknown;
  description: string | undefined;
}

/**
 * Remove the wrappers (optional, default, refinements, ...) around a schema
 */
function unwrap(node: ZodNode): Unwrapped {
  let current = node;
  let required = true;
  let defaultValue: unknown;
  let description = node._def?.description ?? node.description;

  for (let depth = 0; depth < 32; depth++) {
    const def = current._def;
    const typeName = def?.typeName;
    if (!def || !typeName || !WRAPPERS.has(typeName)) {
      break;
    }
    let next: ZodNode | undefined;
    switch (typeName) {
      case "ZodOptional":
        required = false;
        next = def.innerType;
        break;
      case "ZodDefault":
        required = false;
        defaultValue = def.defaultValue?.();
        next = def.innerType;
        break;
      case "ZodCatch":
        required = false;
        next = def.innerType;
        break;
      case "ZodEffects":
        next = def.schema;
        break;
      case "ZodBranded":
        next = def.type;
        break;
      case "ZodPipeline":
        next = def.in;
        break;
      case "ZodLazy":
        next = def.getter?.();
        break;
      default:
        next = def.innerType;
    }
    if (!next) {
      break;
    }
    current = next;
    description ??= current._def?.description ?? current.description;
  }

  return { node: current, required, defaultValue, description };
}

/**
 * The CLI type of a schema
 */
export function fieldTypeOf(schema: unknown): FieldType {
  if (!schema || typeof schema !== "object") {
    return { kind: "any" };
  }
  const { node } = unwrap(schema as ZodNode);
  const def = node._def;
  switch (def?.typeName) {
    case "ZodString":
      return { kind: "string" };
    case "ZodNumber":
      return { kind: "number" };
    case "ZodBigInt":
      return { kind: "bigint" };
    case "ZodBoolean":
      return { kind: "boolean" };
    case "ZodDate":
      return { kind: "date" };
    case "ZodEnum":
      return { kind: "enum", values: Array.isArray(def.values) ? def.values : [] };
    case "ZodNativeEnum": {
      const values = Object.values((def.values ?? {}) as Record<string, string | number>);
      return values.every((value) => typeof value === "string")
        ? { kind: "enum", values: values as string[] }
        : { kind: "any" };
    }
    case "ZodLiteral":
      return { kind: "literal", literal: def.value };
    case "ZodArray":
      return { kind: "array", item: fieldTypeOf(def.type) };
    case "ZodRecord":
      return { kind: "record", value: fieldTypeOf(def.valueType) };
    case "ZodObject":
      return { kind: "object" };
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      const options = def.options instanceof Map ? [...def.options.values()] : [...(def.options ?? [])];
      return { kind: "union", options: options.map((option) => fieldTypeOf(option)) };
    }
    default:
      return { kind: "any" };
  }
}

/**
 * The display name of a type, for the help text
 */
function typeName(type: FieldType): string {
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
 * The object shape of a schema, if it has one
 */
function shapeOf(schema: unknown): Record<string, ZodNode> | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const outer = schema as ZodNode;
  if (outer.shape && typeof outer.shape === "object") {
    return outer.shape;
  }
  const { node } = unwrap(outer);
  if (node._def?.shape) {
    return node._def.shape();
  }
  if (node.shape && typeof node.shape === "object") {
    return node.shape;
  }
  return undefined;
}

/**
 * Extract field information from a Zod-like schema. A schema that is not an object (or has no
 * readable shape) gives no fields: the CLI then passes its flags through.
 */
export function extractSchemaFields(schema: unknown): SchemaFieldInfo[] {
  const shape = shapeOf(schema);
  if (!shape) {
    return [];
  }

  const fields: SchemaFieldInfo[] = [];
  for (const [name, field] of Object.entries(shape)) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const unwrapped = unwrap(field);
    const fieldType = fieldTypeOf(field);
    fields.push({
      name,
      type: fieldType.kind === "enum" ? "enum" : typeName(fieldType),
      fieldType,
      required: unwrapped.required,
      description: unwrapped.description,
      defaultValue: unwrapped.defaultValue,
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

const NUMBER_TEXT = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$|^0[xX][0-9a-fA-F]+$/;
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

// =============================================================================
// The old parameter interface
// =============================================================================

/**
 * Gluegun parameters shape
 */
export interface Parameters {
  first?: string;
  second?: string;
  third?: string;
  array?: string[];
  options?: Record<string, unknown>;
  raw?: string[];
  string?: string;
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
 * Convert one parameter by the type of its field. A value that is not text (true for a flag
 * with no value) is not changed.
 */
function convertParameter(value: unknown, type: FieldType, label: string): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const converted = convertValue(value, type, label);
  if (!converted.ok) {
    throw new Error(converted.error);
  }
  return converted.value;
}

/**
 * Parse CLI parameters into procedure input based on metadata. With the schema, each value is
 * converted by the type of its field: a string field keeps its text. Without the schema, a value
 * is JSON when it parses as JSON, and text otherwise.
 */
export function parseFromSchema(
  params: Parameters,
  meta: CLIMeta,
  schema?: unknown
): Record<string, unknown> {
  const positionalArgs = meta.args ?? [];
  const shorts = meta.shorts ?? {};
  const fields = new Map(extractSchemaFields(schema).map((field) => [field.name, field.fieldType]));
  const typeOfField = (field: string): FieldType => fields.get(field) ?? { kind: "any" };
  const input: Record<string, unknown> = {};

  // 1. Parse positional args
  const positionalValues = params.array ?? [];
  positionalArgs.forEach((field, i) => {
    if (positionalValues[i] !== undefined) {
      input[field] = convertParameter(positionalValues[i], typeOfField(field), field);
    }
  });

  // 2. Parse options from CLI flags
  const options = params.options ?? {};

  // Build reverse lookup for short flags
  const shortToField: Record<string, string> = {};
  for (const [field, short] of Object.entries(shorts)) {
    shortToField[short] = field;
  }

  for (const [key, value] of Object.entries(options)) {
    // Skip if it's a positional arg already set
    if (positionalArgs.includes(key) && input[key] !== undefined) {
      continue;
    }
    const field = shortToField[key] ?? (key.includes("-") ? toCamel(key) : key);
    input[field] = convertParameter(value, typeOfField(field), `--${toKebab(field)}`);
  }

  return input;
}

// =============================================================================
// Help
// =============================================================================

/**
 * How to give a field on the command line, for the help text
 */
function valueHint(field: SchemaFieldInfo): string {
  const type = field.fieldType;
  switch (type.kind) {
    case "boolean":
      return "";
    case "array":
      return ` <${typeName(type.item ?? { kind: "any" })}>... (repeat the flag, or give a JSON array)`;
    case "record":
      return " <key=value>... (repeat the flag, or give a JSON object)";
    case "object":
    case "any":
      return " <json>";
    case "enum":
      return ` <${(field.enumValues ?? []).join("|")}>`;
    default:
      return ` <${typeName(type)}>`;
  }
}

/**
 * Generate help text for a procedure based on its metadata and schema
 */
export function generateHelp(
  path: string[],
  meta: CLIMeta,
  schema?: unknown
): string {
  const positionalArgs = meta.args ?? [];
  const shorts = meta.shorts ?? {};

  const lines: string[] = [];

  // Extract schema fields for enhanced help
  const schemaFields = schema ? extractSchemaFields(schema) : [];
  const schemaFieldMap = new Map(schemaFields.map((f) => [f.name, f]));

  // Command signature: the last positional array takes the rest of the arguments
  const cmdName = `mark ${path.join(" ")}`;
  const posStr = positionalArgs
    .map((a, i) => {
      const many = i === positionalArgs.length - 1 && schemaFieldMap.get(a)?.fieldType.kind === "array";
      return many ? `<${a}...>` : `<${a}>`;
    })
    .join(" ");
  lines.push(`Usage: ${cmdName}${posStr ? " " + posStr : ""} [options]`);
  lines.push("");

  if (meta.description) {
    lines.push(meta.description);
    lines.push("");
  }

  // Positional args with schema info
  if (positionalArgs.length > 0) {
    lines.push("Arguments:");
    for (const arg of positionalArgs) {
      const fieldInfo = schemaFieldMap.get(arg);
      const typeStr = fieldInfo ? ` (${fieldInfo.type})` : "";
      const reqStr = fieldInfo?.required ? " [required]" : "";
      const descStr = fieldInfo?.description ? `  ${fieldInfo.description}` : "";
      lines.push(`  ${arg}${typeStr}${reqStr}`);
      if (descStr) {
        lines.push(`    ${descStr}`);
      }
    }
    lines.push("");
  }

  // Options: each schema field that is not positional, with its short flag if it has one
  const optionLines: string[] = [];
  const positionalSet = new Set(positionalArgs);
  const listed = new Set<string>();
  const optionFields = [
    ...Object.keys(shorts).map((name) => schemaFieldMap.get(name) ?? fieldWithoutSchema(name)),
    ...schemaFields.filter((field) => !(field.name in shorts) && !positionalSet.has(field.name)),
  ];
  for (const field of optionFields) {
    if (listed.has(field.name)) {
      continue;
    }
    listed.add(field.name);
    const short = shorts[field.name];
    const kebab = toKebab(field.name);
    const flag = short ? `  -${short}, --${kebab}` : `      --${kebab}`;
    const negation = field.fieldType.kind === "boolean" ? ` (or --no-${kebab})` : "";
    const reqStr = field.required ? " [required]" : "";
    const defaultStr = field.defaultValue !== undefined ? ` (default: ${JSON.stringify(field.defaultValue)})` : "";
    optionLines.push(`${flag}${valueHint(field)}${negation}${reqStr}${defaultStr}`);
    if (field.description) {
      optionLines.push(`        ${field.description}`);
    }
  }

  if (optionLines.length > 0) {
    lines.push("Options:");
    lines.push(...optionLines);
  }

  // Standard options
  lines.push("");
  lines.push("Global Options (before the command, or after it when the command has no flag of that name):");
  for (const flag of CLI_GLOBAL_FLAGS) {
    if (flag.mode || flag.serverOption || flag.long === "version") {
      continue;
    }
    const name = flag.short ? `-${flag.short}, --${flag.long}` : `    --${flag.long}`;
    lines.push(`  ${name.padEnd(18)} ${flag.description}`);
  }

  return lines.join("\n");
}

/** A field that only the metadata names (the schema has no readable shape) */
function fieldWithoutSchema(name: string): SchemaFieldInfo {
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
