/**
 * pnpm.install procedure
 *
 * Install packages using pnpm.
 */
/**
 * Install packages using pnpm
 *
 * @example
 * // Install all dependencies from package.json
 * await client.call(["pnpm", "install"], {});
 *
 * @example
 * // Install specific packages as dev dependencies
 * await client.call(["pnpm", "install"], {
 *   packages: ["vitest", "@types/node"],
 *   dev: true,
 * });
 */
export async function pnpmInstall(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["install"];
        // Add packages if specified
        if (input.packages && input.packages.length > 0) {
            args.push(...input.packages);
        }
        // Add flags
        if (input.dev)
            args.push("--save-dev");
        if (input.frozen)
            args.push("--frozen-lockfile");
        // Build command string for shell.exec (uses shell: true, works cross-platform)
        const command = ["pnpm", ...args].join(" ");
        const shellInput = { command };
        if (input.cwd !== undefined)
            shellInput.cwd = input.cwd;
        if (input.timeout !== undefined)
            shellInput.timeout = input.timeout;
        // Call shell.exec (uses shell: true by default, finds pnpm.cmd on Windows)
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
//# sourceMappingURL=install.js.map