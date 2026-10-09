/**
 * Workspace helpers
 *
 * The client packages live in one pnpm workspace (the client monorepo). These helpers
 * find the workspace root and decide which dependencies link two ecosystem packages,
 * so the lib.* procedures work on the monorepo instead of one git repository per package.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMark1Russell7Ref } from "./git/index.js";

/**
 * Expand a leading `~/` to the home directory
 */
export function expandHome(p: string): string {
  if (p === "~") {
    return homedir();
  }
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

/**
 * Find the nearest folder at or above `start` that holds pnpm-workspace.yaml
 */
export function findWorkspaceRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Resolve the workspace root for a procedure call: the explicit `rootPath` if given,
 * else the workspace that contains this package.
 */
export function resolveWorkspaceRoot(rootPath?: string): string {
  if (rootPath) {
    // Only a real workspace root: lib.new runs that workspace's cue CLI, and lib.rename rewrites
    // its files, so a rootPath elsewhere ran a script from any folder (deep dive DATA-18)
    const root = resolve(expandHome(rootPath));
    if (!existsSync(join(root, "pnpm-workspace.yaml"))) {
      throw new Error(`Not a workspace root (no pnpm-workspace.yaml): ${root}`);
    }
    return root;
  }
  const own = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
  if (!own) {
    throw new Error("Could not find the workspace root (no pnpm-workspace.yaml above client-lib). Pass rootPath.");
  }
  return own;
}

/**
 * The folder that holds the workspace packages
 */
export function packagesDir(root: string): string {
  return join(root, "packages");
}

/**
 * Return true if a dependency spec links to another ecosystem package:
 * a workspace link (`workspace:*`) or a `github:mark1russell7/...` reference.
 */
export function isEcosystemDependencySpec(spec: string): boolean {
  return spec.startsWith("workspace:") || isMark1Russell7Ref(spec);
}

/**
 * Collect the names of the @mark1russell7 packages that a package.json depends on
 * (dependencies, devDependencies and peerDependencies), without duplicates.
 */
export function extractEcosystemDeps(pkg: {
  dependencies?: Record<string, string> | undefined;
  devDependencies?: Record<string, string> | undefined;
  peerDependencies?: Record<string, string> | undefined;
}): string[] {
  const names = new Set<string>();
  for (const deps of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    for (const [name, spec] of Object.entries(deps ?? {})) {
      if (name.startsWith("@mark1russell7/") && isEcosystemDependencySpec(spec)) {
        names.add(name);
      }
    }
  }
  return [...names];
}
