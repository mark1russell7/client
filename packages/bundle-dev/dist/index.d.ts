/**
 * @mark1russell7/bundle-dev
 *
 * Dev workflow bundle - aggregates client packages for development.
 *
 * Includes:
 * - client-shell: Shell execution
 * - client-fs: Filesystem operations
 * - client-cli: Mark CLI wrapper
 * - client-pnpm: pnpm wrapper
 * - client-lib: Library management
 * - client-git: Git operations
 * - client-dag: Dependency graph
 * - client-procedure: Procedure management
 *
 * @example
 * ```typescript
 * // Import the bundle to register all procedures
 * import "@mark1russell7/bundle-dev/register.js";
 *
 * // Now all procedures are available
 * await client.call(["pnpm", "install"], {});
 * await client.call(["git", "status"], {});
 * await client.call(["lib", "new"], { name: "my-package" });
 * ```
 */
export * from "./register.js";
//# sourceMappingURL=index.d.ts.map