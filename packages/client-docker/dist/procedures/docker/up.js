/**
 * docker.compose.up procedure
 *
 * Start services with docker compose.
 */
/**
 * Start services with docker compose
 */
export async function dockerComposeUp(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["compose"];
        if (input.file)
            args.push("-f", input.file);
        args.push("up");
        if (input.detach)
            args.push("-d");
        if (input.build)
            args.push("--build");
        if (input.forceRecreate)
            args.push("--force-recreate");
        if (input.services && input.services.length > 0) {
            args.push(...input.services);
        }
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
//# sourceMappingURL=up.js.map