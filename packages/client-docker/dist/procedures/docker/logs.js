/**
 * docker.logs procedure
 *
 * Get container logs.
 */
/**
 * Get container logs
 */
export async function dockerLogs(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["logs"];
        if (input.follow)
            args.push("-f");
        if (input.tail !== undefined)
            args.push("--tail", String(input.tail));
        if (input.timestamps)
            args.push("-t");
        args.push(input.container);
        const command = ["docker", ...args].join(" ");
        const shellInput = { command };
        if (input.cwd !== undefined)
            shellInput.cwd = input.cwd;
        if (input.timeout !== undefined)
            shellInput.timeout = input.timeout;
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
//# sourceMappingURL=logs.js.map