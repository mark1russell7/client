/**
 * pnpm.run procedure
 *
 * Run package scripts using pnpm.
 */
/**
 * Run a package script using pnpm
 *
 * @example
 * // Run build script
 * await client.call(["pnpm", "run"], {
 *   script: "build",
 * });
 *
 * @example
 * // Run test with arguments
 * await client.call(["pnpm", "run"], {
 *   script: "test",
 *   args: ["--watch"],
 * });
 */
export async function pnpmRun(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["run", input.script];
        // Add additional arguments
        if (input.args && input.args.length > 0) {
            args.push("--", ...input.args);
        }
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
//# sourceMappingURL=run.js.map