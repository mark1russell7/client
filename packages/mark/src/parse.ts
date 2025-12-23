/**
 * Schema-based CLI Argument Parser
 *
 * Parses CLI arguments based on procedure metadata.
 * Validation is delegated to the procedure's schema.
 */

/**
 * CLI metadata that can be attached to procedures via .meta()
 */
export interface CLIMeta {
  /** Description for help text */
  description?: string;
  /** Field names that are positional args (in order) */
  args?: string[];
  /** Short flag mappings: { fieldName: "f" } */
  shorts?: Record<string, string>;
  /** Output format hint */
  output?: "text" | "json" | "table" | "streaming";
  /** Whether to prompt for missing required fields */
  interactive?: boolean;
}

/**
 * Zod-like schema shape for introspection
 */
interface ZodShape {
  _def?: {
    typeName?: string;
    shape?: () => Record<string, ZodField>;
    innerType?: ZodShape;
    defaultValue?: () => unknown;
    description?: string;
  };
  shape?: Record<string, ZodField>;
  description?: string;
}

interface ZodField {
  _def?: {
    typeName?: string;
    description?: string;
    innerType?: ZodField;
    defaultValue?: () => unknown;
    values?: readonly string[];
  };
  description?: string;
  isOptional?: () => boolean;
}

/**
 * Extracted schema field info for help generation
 */
export interface SchemaFieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string | undefined;
  defaultValue: unknown;
  enumValues: readonly string[] | undefined;
}

/**
 * Extract field information from a Zod-like schema
 */
export function extractSchemaFields(schema: unknown): SchemaFieldInfo[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const zodSchema = schema as ZodShape;
  const fields: SchemaFieldInfo[] = [];

  // Get the shape from the schema
  let shape: Record<string, ZodField> | undefined;

  if (zodSchema._def?.shape) {
    shape = zodSchema._def.shape();
  } else if (zodSchema.shape && typeof zodSchema.shape === "object") {
    shape = zodSchema.shape as Record<string, ZodField>;
  }

  if (!shape) {
    return [];
  }

  for (const [name, field] of Object.entries(shape)) {
    const info = extractFieldInfo(name, field);
    if (info) {
      fields.push(info);
    }
  }

  return fields;
}

/**
 * Extract info from a single schema field
 */
function extractFieldInfo(name: string, field: ZodField): SchemaFieldInfo | null {
  if (!field || typeof field !== "object") {
    return null;
  }

  const def = field._def;
  let typeName = def?.typeName ?? "unknown";
  let required = true;
  let description = def?.description ?? field.description;
  let defaultValue: unknown;
  let enumValues: readonly string[] | undefined;
  let innerField = field;

  // Unwrap optional/default wrappers
  while (innerField._def) {
    const innerDef = innerField._def;

    if (innerDef.typeName === "ZodOptional") {
      required = false;
      if (innerDef.innerType) {
        innerField = innerDef.innerType;
      } else {
        break;
      }
    } else if (innerDef.typeName === "ZodDefault") {
      required = false;
      defaultValue = innerDef.defaultValue?.();
      if (innerDef.innerType) {
        innerField = innerDef.innerType;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Get the actual type
  const finalDef = innerField._def;
  if (finalDef?.typeName) {
    typeName = finalDef.typeName.replace("Zod", "").toLowerCase();
  }

  // Get enum values if applicable
  if (finalDef?.typeName === "ZodEnum" && finalDef.values) {
    enumValues = finalDef.values;
    typeName = "enum";
  }

  // Get description from inner type if not on outer
  if (!description && finalDef?.description) {
    description = finalDef.description;
  }

  return {
    name,
    type: typeName,
    required,
    description,
    defaultValue,
    enumValues,
  };
}

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
function toKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Coerce a string value to appropriate type based on common patterns
 */
function coerceValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  // Already not a string
  if (typeof value !== "string") {
    return value;
  }

  // Boolean-like strings
  if (value === "true") return true;
  if (value === "false") return false;

  // Number-like strings
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") {
    return num;
  }

  // JSON-like strings
  if ((value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      // Not valid JSON, keep as string
    }
  }

  return value;
}

/**
 * Parse CLI parameters into procedure input based on metadata
 */
export function parseFromSchema(
  params: Parameters,
  meta: CLIMeta
): Record<string, unknown> {
  const positionalArgs = meta.args ?? [];
  const shorts = meta.shorts ?? {};
  const input: Record<string, unknown> = {};

  // 1. Parse positional args
  const positionalValues = params.array ?? [];
  positionalArgs.forEach((field, i) => {
    if (positionalValues[i] !== undefined) {
      input[field] = coerceValue(positionalValues[i]);
    }
  });

  // 2. Parse options from CLI flags
  const options = params.options ?? {};

  // Build reverse lookup for short flags
  const shortToField: Record<string, string> = {};
  for (const [field, short] of Object.entries(shorts)) {
    shortToField[short] = field;
  }

  // Process all options
  for (const [key, value] of Object.entries(options)) {
    // Skip if it's a positional arg already set
    if (positionalArgs.includes(key) && input[key] !== undefined) {
      continue;
    }

    // Determine the field name
    let field: string;

    if (shortToField[key]) {
      // Short flag: -f → force
      field = shortToField[key];
    } else if (key.includes("-")) {
      // Kebab case: skip-git → skipGit
      field = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    } else {
      // Already camelCase or exact match
      field = key;
    }

    input[field] = coerceValue(value);
  }

  return input;
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

  // Command signature
  const cmdName = `mark ${path.join(" ")}`;
  const posStr = positionalArgs.map((a) => `<${a}>`).join(" ");
  lines.push(`Usage: ${cmdName}${posStr ? " " + posStr : ""} [options]`);
  lines.push("");

  if (meta.description) {
    lines.push(meta.description);
    lines.push("");
  }

  // Extract schema fields for enhanced help
  const schemaFields = schema ? extractSchemaFields(schema) : [];
  const schemaFieldMap = new Map(schemaFields.map(f => [f.name, f]));

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

  // Build set of fields that have explicit shorts
  const fieldsWithShorts = new Set(Object.keys(shorts));

  // Options section
  const optionLines: string[] = [];

  // First, add options from shorts
  for (const [field, short] of Object.entries(shorts)) {
    const kebab = toKebab(field);
    const fieldInfo = schemaFieldMap.get(field);
    const typeStr = fieldInfo ? ` <${fieldInfo.type}>` : "";
    const descStr = fieldInfo?.description ?? "";
    const defaultStr = fieldInfo?.defaultValue !== undefined
      ? ` (default: ${JSON.stringify(fieldInfo.defaultValue)})`
      : "";
    const enumStr = fieldInfo?.enumValues
      ? ` [${fieldInfo.enumValues.join("|")}]`
      : "";

    optionLines.push(`  -${short}, --${kebab}${typeStr}${enumStr}${defaultStr}`);
    if (descStr) {
      optionLines.push(`        ${descStr}`);
    }
  }

  // Then, add options from schema that don't have shorts (and aren't positional)
  const positionalSet = new Set(positionalArgs);
  for (const field of schemaFields) {
    if (fieldsWithShorts.has(field.name) || positionalSet.has(field.name)) {
      continue;
    }

    const kebab = toKebab(field.name);
    const typeStr = ` <${field.type}>`;
    const reqStr = field.required ? " [required]" : "";
    const defaultStr = field.defaultValue !== undefined
      ? ` (default: ${JSON.stringify(field.defaultValue)})`
      : "";
    const enumStr = field.enumValues
      ? ` [${field.enumValues.join("|")}]`
      : "";
    const descStr = field.description ?? "";

    optionLines.push(`      --${kebab}${typeStr}${enumStr}${reqStr}${defaultStr}`);
    if (descStr) {
      optionLines.push(`        ${descStr}`);
    }
  }

  if (optionLines.length > 0) {
    lines.push("Options:");
    lines.push(...optionLines);
  }

  // Standard options
  lines.push("");
  lines.push("Global Options:");
  lines.push("  -h, --help       Show this help message");
  lines.push("  -f, --format     Output format: text|json|table|streaming");
  lines.push("  -V, --verbose    Show verbose output");

  return lines.join("\n");
}
