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

/** The name of the definition that a schema refers to, or undefined. */
export function definitionName(node: Record<string, unknown>): string | undefined {
  const ref = node["$ref"];
  return typeof ref === "string" && ref.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : undefined;
}

/** The schema itself, or the definition that it refers to. A cycle of references gives its last schema. */
export function resolvedSchema(schema: unknown, defs: ExportsManifest["$defs"]): Record<string, unknown> | undefined {
  let node = schema;
  const seen = new Set<string>();
  while (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const name = definitionName(node as Record<string, unknown>);
    if (name === undefined || seen.has(name)) return node as Record<string, unknown>;
    seen.add(name);
    node = defs[name];
  }
  return undefined;
}

/**
 * True when a schema has a node that `found` accepts, also through its definitions. The search
 * does not go into a node that `stop` accepts. `memo` keeps the result for each schema object, so
 * each memo serves one manifest and one test.
 */
export function reachesNode(
  schema: unknown,
  defs: ExportsManifest["$defs"],
  found: (node: Record<string, unknown>) => boolean,
  memo: WeakMap<object, boolean>,
  stop: (node: Record<string, unknown>) => boolean = () => false,
): boolean {
  if (schema === null || typeof schema !== "object") return false;
  const known = memo.get(schema);
  if (known !== undefined) return known;
  const seen = new Set<string>();
  const visit = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(visit);
    const record = node as Record<string, unknown>;
    if (found(record)) return true;
    if (stop(record)) return false;
    const name = definitionName(record);
    if (name !== undefined) {
      if (seen.has(name)) return false;
      seen.add(name);
      return visit(defs[name]);
    }
    return Object.values(record).some(visit);
  };
  const result = visit(schema);
  memo.set(schema, result);
  return result;
}
