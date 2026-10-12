/**
 * The tool surface of an MCP server: which procedures are tools.
 *
 * A bundle (for example `@procedures/bundle-mcp`) registers procedures when it is imported.
 * Its `register.js` exports `mcpNamespaces` (the first path segments of the tools) and
 * `mcpExclude` (procedure keys of those namespaces that are not tools). The dev-tools server
 * (`impl-mcp-dev`) and `mcp.serve` build their expose rule from these lists.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { surfaceRule, type ProcedurePath, type ToolSurface } from "@procedures/client";

/** The tools of a server: the namespaces, less the excluded procedure keys (the core type). */
export type { ToolSurface };

/** The exports of a bundle's `register.js` that describe its tools. */
export interface BundleSurfaceModule {
  mcpNamespaces?: readonly string[];
  mcpExclude?: readonly string[];
}

/** The expose rule of a tool surface: `surfaceRule()` of the core host policy (roadmap 2.3). */
export function exposeRule(surface: ToolSurface): (path: ProcedurePath) => boolean {
  return surfaceRule(surface);
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
 * The file URL of a bundle's `register.js`, found in the `node_modules` folders from `from`
 * upward. The bundle's `exports` map gives the file. (`require.resolve` cannot do it: a bundle
 * exports `register.js` for `import` only.)
 */
export function resolveBundleRegister(bundle: string, from: string): string {
  let dir = resolve(from);
  for (;;) {
    const folder = join(dir, "node_modules", ...bundle.split("/"));
    const manifestPath = join(folder, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: Record<string, unknown> };
      const entry = manifest.exports?.["./register.js"];
      const target =
        typeof entry === "string"
          ? entry
          : ((entry as { import?: string; default?: string } | undefined)?.import ??
            (entry as { default?: string } | undefined)?.default ??
            "./dist/register.js");
      return pathToFileURL(join(folder, target)).href;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Cannot find ${bundle} from ${from}`);
    dir = parent;
  }
}

/**
 * This function imports the `register.js` of each bundle, which registers its procedures, and
 * returns the modules. With `from`, a bundle resolves from that folder (a project), not from
 * this package.
 */
export async function importBundles(bundles: readonly string[], from?: string): Promise<BundleSurfaceModule[]> {
  const modules: BundleSurfaceModule[] = [];
  for (const bundle of bundles) {
    const target = from ? resolveBundleRegister(bundle, from) : `${bundle}/register.js`;
    modules.push((await import(target)) as BundleSurfaceModule);
  }
  return modules;
}
