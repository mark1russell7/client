/**
 * pnpm.add procedure
 *
 * Add packages using pnpm.
 */
/**
 * Add packages using pnpm
 *
 * @example
 * // Add a package
 * await client.call(["pnpm", "add"], {
 *   packages: ["lodash"],
 * });
 *
 * @example
 * // Add as dev dependency
 * await client.call(["pnpm", "add"], {
 *   packages: ["vitest", "@types/node"],
 *   dev: true,
 * });
 */
export async function pnpmAdd(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["add", ...input.packages];
        // Add flags
        if (input.dev)
            args.push("--save-dev");
        if (input.global)
            args.push("--global");
        // Build command string for shell.exec
        const command = ["pnpm", ...args].join(" ");
        const shellInput = { command };
        if (input.cwd !== undefined)
            shellInput.cwd = input.cwd;
        if (input.timeout !== undefined)
            shellInput.timeout = input.timeout;
        // Call shell.exec (uses shell: true by default)
        const result = await ctx.client.call(["shell", "exec"], shellInput);
        return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            success: result.exitCode === 0,
            duration: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            exitCode: 1,
            stdout: "",
            stderr: error instanceof Error ? error.message : String(error),
            success: false,
            duration: Date.now() - startTime,
        };
    }
}
//# sourceMappingURL=add.js.map