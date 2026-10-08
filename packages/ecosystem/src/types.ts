/**
 * Ecosystem Manifest Types
 *
 * TypeScript types for the ecosystem manifest.
 * These types correspond to the Cue schema in @mark1russell7/cue/ecosystem/schema.cue
 */

/**
 * A single package entry in the ecosystem
 */
export interface PackageEntry {
  /** Git repository reference (e.g., "github:mark1russell7/cue#main") */
  repo: string;
  /** Path relative to root (e.g., "cue" or "docker/sqlite") */
  path: string;
  /** Branch name (defaults to "main") */
  branch?: string;
}

/**
 * Project template configuration
 */
export interface ProjectTemplate {
  /** Standard files every project should have */
  files: string[];
  /** Standard directories every project should have */
  dirs: string[];
}

/**
 * The ecosystem manifest - source of truth for all packages
 */
export interface EcosystemManifest {
  /** Manifest version */
  version: string;
  /** Root directory for all packages (e.g., "~/git") */
  root: string;
  /** Map of package name to package entry */
  packages: Record<string, PackageEntry>;
  /** Template for new projects */
  projectTemplate: ProjectTemplate;
}

/**
 * Package name (e.g., "@mark1russell7/cue")
 */
export type PackageName = string;

/**
 * Git reference format (e.g., "github:mark1russell7/cue#main")
 */
export type GitRef = string;
