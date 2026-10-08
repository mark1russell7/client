/**
 * docker.build procedure
 *
 * Build a Docker image.
 */
/**
 * Build a Docker image
 */
export async function dockerBuild(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["build"];
        // Add tag
        args.push("-t", input.tag);
        // Add dockerfile if specified
        if (input.dockerfile) {
            args.push("-f", input.dockerfile);
        }
        // Add build args
        if (input.buildArgs) {
            for (const [key, value] of Object.entries(input.buildArgs)) {
                args.push("--build-arg", `${key}=${value}`);
            }
        }
        // Add no-cache flag
        if (input.noCache) {
            args.push("--no-cache");
        }
        // Add context
        args.push(input.context);
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
//# sourceMappingURL=build.js.map