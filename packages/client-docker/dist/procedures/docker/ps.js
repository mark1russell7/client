/**
 * docker.ps procedure
 *
 * List containers.
 */
/**
 * List containers
 */
export async function dockerPs(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["ps"];
        if (input.all)
            args.push("-a");
        if (input.filter)
            args.push("--filter", input.filter);
        if (input.format)
            args.push("--format", input.format);
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
//# sourceMappingURL=ps.js.map