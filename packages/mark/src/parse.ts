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
 * Generate help text for a procedure based on its metadata
 */
export function generateHelp(
  path: string[],
  meta: CLIMeta
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

  // Positional args
  if (positionalArgs.length > 0) {
    lines.push("Arguments:");
    for (const arg of positionalArgs) {
      lines.push(`  ${arg}`);
    }
    lines.push("");
  }

  // Options (from shorts - these are the explicitly defined CLI options)
  const shortEntries = Object.entries(shorts);
  if (shortEntries.length > 0) {
    lines.push("Options:");
    for (const [field, short] of shortEntries) {
      const kebab = toKebab(field);
      lines.push(`  -${short}, --${kebab}`);
    }
  }

  return lines.join("\n");
}
