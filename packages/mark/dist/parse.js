"use strict";
/**
 * Schema-based CLI Argument Parser
 *
 * Parses CLI arguments based on procedure metadata.
 * Validation is delegated to the procedure's schema.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFromSchema = parseFromSchema;
exports.generateHelp = generateHelp;
/**
 * Convert camelCase to kebab-case
 */
function toKebab(str) {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
/**
 * Coerce a string value to appropriate type based on common patterns
 */
function coerceValue(value) {
    if (value === undefined || value === null) {
        return value;
    }
    // Already not a string
    if (typeof value !== "string") {
        return value;
    }
    // Boolean-like strings
    if (value === "true")
        return true;
    if (value === "false")
        return false;
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
        }
        catch {
            // Not valid JSON, keep as string
        }
    }
    return value;
}
/**
 * Parse CLI parameters into procedure input based on metadata
 */
function parseFromSchema(params, meta) {
    const positionalArgs = meta.args ?? [];
    const shorts = meta.shorts ?? {};
    const input = {};
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
    const shortToField = {};
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
        let field;
        if (shortToField[key]) {
            // Short flag: -f → force
            field = shortToField[key];
        }
        else if (key.includes("-")) {
            // Kebab case: skip-git → skipGit
            field = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        }
        else {
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
function generateHelp(path, meta) {
    const positionalArgs = meta.args ?? [];
    const shorts = meta.shorts ?? {};
    const lines = [];
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
//# sourceMappingURL=parse.js.map