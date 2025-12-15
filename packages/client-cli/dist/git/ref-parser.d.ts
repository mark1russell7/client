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
export declare function parseGitRef(refString: string): GitRef | null;
/**
 * Check if a dependency string is a git reference
 */
export declare function isGitRef(dep: string): boolean;
/**
 * Check if a dependency is a mark1russell7 git reference
 */
export declare function isMark1Russell7Ref(dep: string): boolean;
/**
 * Extract mark1russell7 git refs from package.json dependencies
 */
export declare function extractMark1Russell7Deps(dependencies: Record<string, string>): GitRef[];
/**
 * Get the package name from a git ref
 * Uses the repo name, optionally scoped with @mark1russell7/
 */
export declare function getPackageNameFromRef(ref: GitRef): string;
//# sourceMappingURL=ref-parser.d.ts.map