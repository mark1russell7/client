/**
 * Ecosystem Manifest Loader
 *
 * Loads and exports the ecosystem manifest.
 */

import type { EcosystemManifest } from "./types.js";
import { createRequire } from "node:module";

// Use createRequire to load JSON in ESM
const require = createRequire(import.meta.url);

/**
 * The ecosystem manifest
 */
export const manifest: EcosystemManifest = require("../ecosystem.manifest.json");

/**
 * Get all package names in the ecosystem
 */
export function getPackageNames(): string[] {
  return Object.keys(manifest.packages);
}

/**
 * Get package entry by name
 */
export function getPackage(name: string): EcosystemManifest["packages"][string] | undefined {
  return manifest.packages[name];
}

/**
 * Get the root path (resolving ~)
 */
export function getRootPath(): string {
  const root = manifest.root;
  if (root.startsWith("~/")) {
    const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    return root.replace("~", home);
  }
  return root;
}

/**
 * Get the full path for a package
 */
export function getPackagePath(name: string): string | undefined {
  const pkg = getPackage(name);
  if (!pkg) return undefined;

  const root = getRootPath();
  return `${root}/${pkg.path}`;
}
