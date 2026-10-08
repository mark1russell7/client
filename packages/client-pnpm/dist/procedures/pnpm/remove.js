/**
 * pnpm.remove procedure
 *
 * Remove packages using pnpm.
 */
/**
 * Remove packages using pnpm
 *
 * @example
 * // Remove packages
 * await client.call(["pnpm", "remove"], {
 *   packages: ["lodash"],
 * });
 */
export async function pnpmRemove(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["remove", ...input.packages];
        // Add flags
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
//# sourceMappingURL=remove.js.map