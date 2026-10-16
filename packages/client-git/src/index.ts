/**
 * Client-Git - Git operations as RPC procedures
 *
 * Provides git.status, git.add, git.commit, git.push, and other git procedures.
 *
 * @example
 * ```typescript
 * import "@procedures/git";
 *
 * // Use via client.call
 * await client.call(["git", "status"], { cwd: "./repo" });
 * await client.call(["git", "add"], { paths: ["file.ts"], cwd: "./repo" });
 * await client.call(["git", "commit"], { message: "feat: add feature" });
 * ```
 */

export * from "./procedures/git.js";
export { git, GitError, type GitContext, type GitRunOptions } from "./procedures/git/run.js";
export { parsePorcelainV1, classifyStatus, type GitPorcelainEntry } from "./procedures/git/porcelain.js";
export { parseNumstat } from "./procedures/git/diff.js";
export * from "./module.js";
