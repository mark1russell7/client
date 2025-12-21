/**
 * pnpm.link procedure
 *
 * Link packages using pnpm.
 */
/**
 * Link packages using pnpm
 *
 * @example
 * // Link current directory globally
 * await client.call(["pnpm", "link"], {
 *   global: true,
 * });
 *
 * @example
 * // Link a specific path
 * await client.call(["pnpm", "link"], {
 *   path: "../other-package",
 * });
 */
export async function pnpmLink(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["link"];
        // Add path if specified
        if (input.path !== undefined) {
            args.push(input.path);
        }
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
//# sourceMappingURL=link.js.map