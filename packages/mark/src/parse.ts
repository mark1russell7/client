/**
 * Schema-based CLI Argument Parser
 *
 * Parses CLI arguments based on Zod schema shape and procedure metadata.
 */

import type { z } from "zod";

/**
 * CLI metadata that can be attached to procedures
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
 * Get the Zod type name from a schema
 */
function getZodType(schema: z.ZodTypeAny): string {
  // Unwrap default/optional/nullable wrappers
  let current = schema;
  while (current._def) {
    if (current._def.typeName === "ZodDefault") {
      current = current._def.innerType;
    } else if (current._def.typeName === "ZodOptional") {
      current = current._def.innerType;
    } else if (current._def.typeName === "ZodNullable") {
      current = current._def.innerType;
    } else {
      break;
    }
  }
  return current._def?.typeName ?? "ZodUnknown";
}

/**
 * Coerce a string value to the appropriate type based on schema
 */
function coerce(value: unknown, schema: z.ZodTypeAny): unknown {
  const typeName = getZodType(schema);

  if (value === undefined || value === null) {
    return value;
  }

  switch (typeName) {
    case "ZodBoolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      return Boolean(value);

    case "ZodNumber":
      if (typeof value === "number") return value;
      const num = Number(value);
      return isNaN(num) ? value : num;

    case "ZodString":
      return String(value);

    case "ZodArray":
      if (Array.isArray(value)) return value;
      return [value];

    default:
      return value;
  }
}

/**
 * Check if a Zod schema field is required (no default, not optional)
 */
function isRequired(schema: z.ZodTypeAny): boolean {
  let current = schema;
  while (current._def) {
    if (current._def.typeName === "ZodDefault") {
      return false; // has default
    }
    if (current._def.typeName === "ZodOptional") {
      return false; // optional
    }
    if (current._def.typeName === "ZodNullable") {
      current = current._def.innerType;
    } else {
      break;
    }
  }
  return true;
}

/**
 * Get description from Zod schema
 */
function getDescription(schema: z.ZodTypeAny): string | undefined {
  return schema._def?.description;
}

/**
 * Extract field info from a Zod object schema
 */
export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  isBoolean: boolean;
}

export function extractFields(schema: z.ZodTypeAny): FieldInfo[] {
  if (schema._def?.typeName !== "ZodObject") {
    return [];
  }

  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  const fields: FieldInfo[] = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const zodType = getZodType(fieldSchema as z.ZodTypeAny);
    fields.push({
      name,
      type: zodType.replace("Zod", "").toLowerCase(),
      required: isRequired(fieldSchema as z.ZodTypeAny),
      description: getDescription(fieldSchema as z.ZodTypeAny),
      isBoolean: zodType === "ZodBoolean",
    });
  }

  return fields;
}

/**
 * Parse CLI parameters into procedure input based on schema and metadata
 */
export function parseFromSchema(
  params: Parameters,
  schema: z.ZodTypeAny,
  meta: CLIMeta
): Record<string, unknown> {
  if (schema._def?.typeName !== "ZodObject") {
    // Not an object schema - try to use first arg as the whole input
    if (params.first !== undefined) {
      try {
        return JSON.parse(params.first) as Record<string, unknown>;
      } catch {
        return { value: params.first };
      }
    }
    return {};
  }

  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  const positionalArgs = meta.args ?? [];
  const shorts = meta.shorts ?? {};
  const input: Record<string, unknown> = {};

  // 1. Parse positional args
  const positionalValues = params.array ?? [];
  positionalArgs.forEach((field, i) => {
    if (positionalValues[i] !== undefined && shape[field]) {
      input[field] = coerce(positionalValues[i], shape[field] as z.ZodTypeAny);
    }
  });

  // 2. Parse options (everything not positional)
  const options = params.options ?? {};

  for (const [field, fieldSchema] of Object.entries(shape)) {
    if (positionalArgs.includes(field) && input[field] !== undefined) {
      continue; // Already handled as positional
    }

    const kebab = toKebab(field);
    const short = shorts[field];

    // Check various forms: --skip-git, --skipGit, -g
    let value: unknown = undefined;

    if (options[kebab] !== undefined) {
      value = options[kebab];
    } else if (options[field] !== undefined) {
      value = options[field];
    } else if (short && options[short] !== undefined) {
      value = options[short];
    }

    if (value !== undefined) {
      input[field] = coerce(value, fieldSchema as z.ZodTypeAny);
    }
  }

  return input;
}

/**
 * Generate help text for a procedure based on its schema and metadata
 */
export function generateHelp(
  path: string[],
  schema: z.ZodTypeAny,
  meta: CLIMeta
): string {
  const fields = extractFields(schema);
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

  // Positional args
  if (positionalArgs.length > 0) {
    lines.push("Arguments:");
    for (const arg of positionalArgs) {
      const field = fields.find((f) => f.name === arg);
      const desc = field?.description ?? "";
      const req = field?.required ? "(required)" : "(optional)";
      lines.push(`  ${arg}  ${desc} ${req}`);
    }
    lines.push("");
  }

  // Options
  const optionFields = fields.filter((f) => !positionalArgs.includes(f.name));
  if (optionFields.length > 0) {
    lines.push("Options:");
    for (const field of optionFields) {
      const kebab = toKebab(field.name);
      const short = shorts[field.name];
      const shortStr = short ? `-${short}, ` : "    ";
      const desc = field.description ?? "";
      const typeStr = field.isBoolean ? "" : ` <${field.type}>`;
      lines.push(`  ${shortStr}--${kebab}${typeStr}  ${desc}`);
    }
  }

  return lines.join("\n");
}
