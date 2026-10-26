/**
 * Schema-based CLI Argument Parser
 *
 * The field types, the conversion of CLI text and the help text are in `@procedures/cli-kit`
 * (roadmap O61). This module gives them to mark with the name `mark` and the global flags of mark.
 */

import { CLI_GLOBAL_FLAGS } from "@procedures/lib/cli-flags";
import {
  convertValue,
  extractSchemaFields,
  generateHelp as kitGenerateHelp,
  toCamel,
  toKebab,
  type CLIMeta,
  type FieldType,
  type SchemaFieldInfo,
} from "@procedures/cli-kit";

export {
  convertValue,
  extractSchemaFields,
  fieldTypeOf,
  fieldsOf,
  mergeValue,
  resultFieldsOf,
  resultFieldsOfSchema,
  toCamel,
  toKebab,
  type CLIMeta,
  type CommandLike,
  type Converted,
  type FieldKind,
  type FieldType,
  type SchemaFieldInfo,
} from "@procedures/cli-kit";

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

/** The global flags that the help of a command lists: not the modes, the options of --server or --version. */
const HELP_GLOBALS = CLI_GLOBAL_FLAGS.filter((flag) => !flag.mode && !flag.serverOption && flag.long !== "version");

/**
 * Generate help text for a procedure based on its metadata and schema. `schema` is the input
 * schema, or the fields of the input (a command of the manifest). `result` gives the fields of
 * the result, which the help lists after the options.
 */
export function generateHelp(
  path: string[],
  meta: CLIMeta,
  schema?: unknown,
  result: readonly SchemaFieldInfo[] = []
): string {
  return kitGenerateHelp(path, meta, schema, result, { name: "mark", globals: HELP_GLOBALS });
}
