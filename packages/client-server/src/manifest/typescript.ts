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

      // Use any for now since we don't have full schema info
      lines.push(`  ${camelCase(methodName)}: {`);
      lines.push(`    path: ${JSON.stringify(proc.path)};`);
      lines.push(`    input: unknown;`);
      lines.push(`    output: unknown;`);
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
