/**
 * TypeScript Declaration Generator
 *
 * Generates .d.ts files from procedure definitions
 * for static type checking on clients.
 */

import type { ProcedureInfo } from "../types.js";

/**
 * Generate TypeScript declaration file content
 */
export function generateTypeScript(procedures: ProcedureInfo[]): string {
  const lines: string[] = [
    "/**",
    " * Auto-generated procedure type declarations",
    ` * Generated at: ${new Date().toISOString()}`,
    " */",
    "",
  ];

  // Group procedures by namespace (first path segment)
  const namespaces = new Map<string, ProcedureInfo[]>();

  for (const proc of procedures) {
    const namespace = proc.path[0] ?? "root";
    const existing = namespaces.get(namespace) ?? [];
    existing.push(proc);
    namespaces.set(namespace, existing);
  }

  // Generate interface for each namespace
  for (const [namespace, procs] of namespaces) {
    lines.push(`export interface ${pascalCase(namespace)}Procedures {`);

    for (const proc of procs) {
      const path = proc.path.slice(1);
      const methodName = path.join("_") || namespace;

      if (proc.description) {
        lines.push(`  /** ${proc.description} */`);
      }

      // The types come from the JSON Schemas; a procedure without one has `unknown`
      lines.push(`  ${camelCase(methodName)}: {`);
      lines.push(`    path: ${JSON.stringify(proc.path)};`);
      lines.push(`    input: ${jsonSchemaToTs(proc.inputSchema, "    ")};`);
      lines.push(`    output: ${jsonSchemaToTs(proc.outputSchema, "    ")};`);
      lines.push(`  };`);
    }

    lines.push(`}`);
    lines.push("");
  }

  // Generate combined type
  lines.push("export interface RemoteProcedures {");
  for (const namespace of namespaces.keys()) {
    lines.push(`  ${camelCase(namespace)}: ${pascalCase(namespace)}Procedures;`);
  }
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

/** A JSON Schema node, as the manifest stores it. */
interface JsonNode {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  items?: JsonNode | JsonNode[];
  properties?: Record<string, JsonNode>;
  required?: string[];
  additionalProperties?: boolean | JsonNode;
  anyOf?: JsonNode[];
  oneOf?: JsonNode[];
  allOf?: JsonNode[];
}

/** A property name as TypeScript writes it: quoted when it is not an identifier. */
function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * The TypeScript type of a JSON Schema: objects, arrays, records, enums, constants and unions.
 * A schema that it cannot read is `unknown`.
 */
export function jsonSchemaToTs(schema: unknown, indent = ""): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const node = schema as JsonNode;
  const union = node.anyOf ?? node.oneOf;
  if (union?.length) return union.map((member) => jsonSchemaToTs(member, indent)).join(" | ");
  if (node.allOf?.length) return node.allOf.map((member) => jsonSchemaToTs(member, indent)).join(" & ");
  if (Array.isArray(node.enum)) return node.enum.map((value) => JSON.stringify(value)).join(" | ") || "never";
  if (node.const !== undefined) return JSON.stringify(node.const);
  const types = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
  if (types.length > 1) return types.map((type) => jsonSchemaToTs({ ...node, type }, indent)).join(" | ");
  switch (types[0]) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return Array.isArray(node.items)
        ? `[${node.items.map((part) => jsonSchemaToTs(part, indent)).join(", ")}]`
        : `Array<${jsonSchemaToTs(node.items, indent)}>`;
    case "object": {
      const properties = Object.entries(node.properties ?? {});
      const extra = node.additionalProperties;
      if (properties.length === 0) {
        return extra && typeof extra === "object" ? `Record<string, ${jsonSchemaToTs(extra, indent)}>` : "Record<string, unknown>";
      }
      const required = new Set(node.required ?? []);
      const inner = `${indent}  `;
      const members = properties.map(
        ([name, value]) => `${inner}${propertyName(name)}${required.has(name) ? "" : "?"}: ${jsonSchemaToTs(value, inner)};`
      );
      return `{\n${members.join("\n")}\n${indent}}`;
    }
    default:
      return "unknown";
  }
}

/**
 * Convert string to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/**
 * Convert string to camelCase
 */
function camelCase(str: string): string {
  const pascal = pascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
