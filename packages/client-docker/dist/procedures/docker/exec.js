/**
 * docker.exec procedure
 *
 * Execute command in a running container.
 */
/**
 * Execute command in container
 */
export async function dockerExec(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["exec"];
        if (input.interactive)
            args.push("-i");
        if (input.tty)
            args.push("-t");
        if (input.workdir)
            args.push("-w", input.workdir);
        // Add environment variables
        if (input.env) {
            for (const [key, value] of Object.entries(input.env)) {
                args.push("-e", `${key}=${value}`);
            }
        }
        args.push(input.container);
        args.push(...input.command.split(" "));
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
//# sourceMappingURL=exec.js.map