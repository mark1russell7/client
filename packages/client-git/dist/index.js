/**
 * Client-Git - Git operations as RPC procedures
 *
 * Provides git.status, git.add, git.commit, git.push, and other git procedures.
 *
 * @example
 * ```typescript
 * import "@mark1russell7/client-git";
 *
 * // Use via client.call
 * await client.call(["git", "status"], { cwd: "./repo" });
 * await client.call(["git", "add"], { paths: ["file.ts"], cwd: "./repo" });
 * await client.call(["git", "commit"], { message: "feat: add feature" });
 * ```
 */
export * from "./procedures/git.js";
export * from "./register.js";
//# sourceMappingURL=index.js.map