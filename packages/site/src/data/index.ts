/**
 * The data of the site. `scripts/gen-data.mjs` generates it from the workspace before each build.
 */

import catalogJson from "./generated/catalog.js";
import packagesJson from "./generated/packages.js";

/** An input field of a core procedure, read from its TypeScript input type. */
export interface Field {
  name: string;
  type: string;
  optional: boolean;
}

/** One procedure of the registry. */
export interface ProcedureInfo {
  key: string;
  path: string[];
  /** The folder of the package that defines the procedure. */
  package: string;
  description: string;
  tags: string[];
  input: JsonSchema;
  output: JsonSchema;
  /** The procedure is in the registry by default (the CLI and the servers can call it). */
  registered: boolean;
  /** The procedure runs in the browser: the Composer can use it. */
  browser: boolean;
  /** The dev-tools MCP server gives the procedure to Claude as a tool. */
  mcp: boolean;
  fields: Field[] | null;
}

/** One package of the workspace. */
export interface PackageInfo {
  dir: string;
  name: string;
  description: string;
  private: boolean;
  /** The folders of the workspace packages that this package uses. */
  deps: string[];
  /** The lines of TypeScript source, without the tests. */
  lines: number;
  procedures: number;
  /** 0 for a package without workspace dependencies, else 1 + the highest level of its dependencies. */
  level: number;
}

/** A JSON Schema, as the MCP layer makes it from a procedure schema. */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export const procedures: ProcedureInfo[] = (catalogJson as unknown as { procedures: ProcedureInfo[] }).procedures;
export const packages: PackageInfo[] = packagesJson as unknown as PackageInfo[];
export const mcpTools: string[] = (catalogJson as unknown as { mcpTools: string[] }).mcpTools;

const byKey = new Map(procedures.map((procedure) => [procedure.key, procedure]));

/** This function gives the procedure at a key ("client.add"), or undefined. */
export function procedureByKey(key: string): ProcedureInfo | undefined {
  return byKey.get(key);
}

/** The category of a core procedure, from its tags: "control-flow", "math", "string" and so on. */
export function categoryOf(procedure: ProcedureInfo): string {
  return procedure.tags.find((tag) => tag !== "core") ?? procedure.path[0] ?? "other";
}
