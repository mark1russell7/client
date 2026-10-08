/**
 * docker.pull procedure
 *
 * Pull a Docker image.
 */
/**
 * Pull a Docker image
 */
export async function dockerPull(input, ctx) {
    const startTime = Date.now();
    try {
        const imageWithTag = input.tag ? `${input.image}:${input.tag}` : input.image;
        const command = `docker pull ${imageWithTag}`;
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
//# sourceMappingURL=pull.js.map