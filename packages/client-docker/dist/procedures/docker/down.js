/**
 * docker.compose.down procedure
 *
 * Stop services with docker compose.
 */
/**
 * Stop services with docker compose
 */
export async function dockerComposeDown(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["compose"];
        if (input.file)
            args.push("-f", input.file);
        args.push("down");
        if (input.volumes)
            args.push("-v");
        if (input.removeOrphans)
            args.push("--remove-orphans");
        if (input.rmi)
            args.push("--rmi", input.rmi);
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
//# sourceMappingURL=down.js.map