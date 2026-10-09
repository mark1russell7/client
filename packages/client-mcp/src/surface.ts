/**
 * The tool surface of an MCP server: which procedures are tools.
 *
 * A bundle (for example `@mark1russell7/bundle-mcp`) registers procedures when it is imported.
 * Its `register.js` exports `mcpNamespaces` (the first path segments of the tools) and
 * `mcpExclude` (procedure keys of those namespaces that are not tools). The dev-tools server
 * (`impl-mcp-dev`) and `mcp.serve` build their expose rule from these lists.
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProcedurePath } from "@mark1russell7/client";

/** The tools of a server: the namespaces, less the excluded procedure keys. */
export interface ToolSurface {
  namespaces: readonly string[];
  exclude?: readonly string[] | undefined;
}

/** The exports of a bundle's `register.js` that describe its tools. */
export interface BundleSurfaceModule {
  mcpNamespaces?: readonly string[];
  mcpExclude?: readonly string[];
}

/** The expose rule of a tool surface. */
export function exposeRule(surface: ToolSurface): (path: ProcedurePath) => boolean {
  const namespaces = new Set(surface.namespaces);
  const excluded = new Set(surface.exclude ?? []);
  return (path) => namespaces.has(path[0] ?? "") && !excluded.has(path.join("."));
}

/**
 * The union of the surfaces of some bundles. Undefined when no bundle has `mcpNamespaces`: such
 * bundles say nothing about their tools.
 */
export function mergeSurfaces(modules: readonly BundleSurfaceModule[]): ToolSurface | undefined {
  let namespaces: Set<string> | undefined;
  const exclude = new Set<string>();
  for (const module of modules) {
    if (Array.isArray(module.mcpNamespaces)) {
      namespaces ??= new Set();
      for (const namespace of module.mcpNamespaces) namespaces.add(namespace);
    }
    for (const key of module.mcpExclude ?? []) exclude.add(key);
  }
  return namespaces ? { namespaces: [...namespaces].sort(), exclude: [...exclude].sort() } : undefined;
}

/**
 * This function imports the `register.js` of each bundle, which registers its procedures, and
 * returns the modules. With `from`, a bundle resolves from that folder (a project), not from
 * this package.
 */
export async function importBundles(bundles: readonly string[], from?: string): Promise<BundleSurfaceModule[]> {
  const modules: BundleSurfaceModule[] = [];
  for (const bundle of bundles) {
    const specifier = `${bundle}/register.js`;
    const target = from ? pathToFileURL(createRequire(join(from, "package.json")).resolve(specifier)).href : specifier;
    modules.push((await import(target)) as BundleSurfaceModule);
  }
  return modules;
}
