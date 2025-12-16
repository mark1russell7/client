/**
 * @mark1russell7/ecosystem
 *
 * Ecosystem manifest - source of truth for all @mark1russell7 packages.
 *
 * @example
 * ```typescript
 * import { manifest, getPackageNames, getPackagePath } from "@mark1russell7/ecosystem";
 *
 * // Get all package names
 * console.log(getPackageNames());
 * // ['@mark1russell7/cue', '@mark1russell7/client', ...]
 *
 * // Get path for a specific package
 * console.log(getPackagePath("@mark1russell7/docker-sqlite"));
 * // '/Users/mark/git/docker/sqlite'
 *
 * // Access manifest directly
 * console.log(manifest.version);
 * // '1.0.0'
 * ```
 */

// Re-export types
export type {
  EcosystemManifest,
  PackageEntry,
  ProjectTemplate,
  PackageName,
  GitRef,
} from "./types.js";

// Re-export manifest and utilities
export {
  manifest,
  getPackageNames,
  getPackage,
  getRootPath,
  getPackagePath,
} from "./manifest.js";
