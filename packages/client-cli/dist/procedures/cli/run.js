/**
 * cli.run procedure
 *
 * Wraps the mark CLI as a procedure using client-shell.
 * This allows calling any mark CLI command programmatically.
 */
/**
 * Run a mark CLI command
 *
 * @example
 * // Equivalent to: mark lib new my-package
 * await client.call(["cli", "run"], {
 *   path: ["lib", "new"],
 *   positional: ["my-package"],
 * });
 *
 * @example
 * // Equivalent to: mark procedure new fs.read --description "Read a file"
 * await client.call(["cli", "run"], {
 *   path: ["procedure", "new"],
 *   positional: ["fs.read"],
 *   args: { description: "Read a file" },
 * });
 */
export async function cliRun(input, ctx) {
    const startTime = Date.now();
    try {
        // Build command args: path + positional + named args
        const args = [...input.path];
        // Add positional arguments
        if (input.positional) {
            args.push(...input.positional);
        }
        // Add named arguments as --key value pairs
        if (input.args) {
            for (const [key, value] of Object.entries(input.args)) {
                if (typeof value === "boolean") {
                    if (value) {
                        args.push(`--${key}`);
                    }
                }
                else {
                    args.push(`--${key}`, String(value));
                }
            }
        }
        // Build shell input
        const shellInput = {
            command: "node",
            args: ["cli/dist/index.js", ...args],
        };
        if (input.cwd !== undefined)
            shellInput.cwd = input.cwd;
        if (input.timeout !== undefined)
            shellInput.timeout = input.timeout;
        // Call shell.run
        const result = await ctx.client.call(["shell", "run"], shellInput);
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