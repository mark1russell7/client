/**
 * Git reference parser
 *
 * Parses git references from package.json dependencies like:
 * - github:mark1russell7/logger#main
 * - github:mark1russell7/client#v1.0.0
 */

import type { GitRef } from "../types.js";

/**
 * Parse a git reference string into its components
 *
 * @example
 * parseGitRef("github:mark1russell7/logger#main")
 * // { raw: "...", host: "github", owner: "mark1russell7", repo: "logger", ref: "main" }
 */
export function parseGitRef(refString: string): GitRef | null {
  // Pattern: host:owner/repo#ref
  // Examples:
  //   github:mark1russell7/logger#main
  //   gitlab:user/project#develop
  const match = refString.match(/^(\w+):([^/]+)\/([^#]+)#(.+)$/);

  if (!match) {
    return null;
  }

  const [, host, owner, repo, ref] = match;

  return {
    raw: refString,
    host: host!,
    owner: owner!,
    repo: repo!,
    ref: ref!,
  };
}

/**
 * Check if a dependency string is a git reference
 */
export function isGitRef(dep: string): boolean {
  return /^\w+:[^/]+\/[^#]+#.+$/.test(dep);
}

/**
 * Check if a dependency is a mark1russell7 git reference
 */
export function isMark1Russell7Ref(dep: string): boolean {
  return dep.includes("mark1russell7/");
}

/**
 * Extract mark1russell7 git refs from package.json dependencies
 */
export function extractMark1Russell7Deps(
  dependencies: Record<string, string>
): GitRef[] {
  const refs: GitRef[] = [];

  for (const [, version] of Object.entries(dependencies)) {
    if (isMark1Russell7Ref(version)) {
      const ref = parseGitRef(version);
      if (ref) {
        refs.push(ref);
      }
    }
  }

  return refs;
}

/**
 * Get the package name from a git ref
 * Uses the repo name, optionally scoped with @mark1russell7/
 */
export function getPackageNameFromRef(ref: GitRef): string {
  // For mark1russell7 repos, the package name is usually @mark1russell7/{repo}
  // But some packages like "client" are unscoped
  // We'll need to check the actual package.json to be sure
  return ref.repo;
}
