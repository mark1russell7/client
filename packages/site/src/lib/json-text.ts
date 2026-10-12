/**
 * JSON text for the eyes: a part that fits in the width stays on one line, and a part that does
 * not fit gets one line for each item. The live panel of the home page and the procedure pages
 * show programs this way.
 */

/** The JSON text of a value on one line, with a space after each colon and comma. */
export function oneLine(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(oneLine).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => `${JSON.stringify(key)}: ${oneLine(item)}`);
    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The JSON text of a value that fits in `width` characters where it can. */
export function compactJson(value: unknown, width = 60, indent = ""): string {
  const flat = oneLine(value);
  if (indent.length + flat.length <= width || value === null || typeof value !== "object") return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => `${inner}${compactJson(item, width, inner)}`).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const label = `${JSON.stringify(key)}: `;
    return `${inner}${label}${compactJson(item, width - label.length, inner)}`;
  });
  return `{\n${entries.join(",\n")}\n${indent}}`;
}
