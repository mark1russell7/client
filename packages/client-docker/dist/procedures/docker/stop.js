/**
 * docker.stop procedure
 *
 * Stop running container(s).
 */
/**
 * Stop container(s)
 */
export async function dockerStop(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["stop"];
        if (input.time !== undefined) {
            args.push("-t", String(input.time));
        }
        args.push(...input.containers);
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
//# sourceMappingURL=stop.js.map