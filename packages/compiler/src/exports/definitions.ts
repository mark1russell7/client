/** The definitions of the schemas of an exports manifest: `{ "$ref": "#/$defs/<name>" }`. */

import type { ExportsJsonSchema, ExportsManifest } from "./types.js";

/** The schema with a `$defs` of each definition that it reaches, so the schema stands alone. */
export function withDefinitions(schema: ExportsJsonSchema, defs: ExportsManifest["$defs"]): ExportsJsonSchema {
  const reached = new Map<string, ExportsJsonSchema>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) {
        const name = value.slice("#/$defs/".length);
        const definition = defs[name];
        if (definition === undefined) throw new Error(`The schema refers to the definition ${name}, which the manifest does not have`);
        if (!reached.has(name)) {
          reached.set(name, definition);
          visit(definition);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(schema);
  if (reached.size === 0) return schema;
  return { ...schema, $defs: Object.fromEntries(reached) };
}
