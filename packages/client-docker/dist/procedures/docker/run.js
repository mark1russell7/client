/**
 * docker.run procedure
 *
 * Run a Docker container.
 */
/**
 * Run a Docker container
 *
 * @example
 * // Run nginx in detached mode
 * await client.call(["docker", "run"], {
 *   image: "nginx:latest",
 *   name: "my-nginx",
 *   ports: ["8080:80"],
 *   detach: true,
 * });
 */
export async function dockerRun(input, ctx) {
    const startTime = Date.now();
    try {
        const args = ["run"];
        // Add flags
        if (input.detach)
            args.push("-d");
        if (input.rm)
            args.push("--rm");
        if (input.name)
            args.push("--name", input.name);
        // Add port mappings
        if (input.ports) {
            for (const port of input.ports) {
                args.push("-p", port);
            }
        }
        // Add volume mappings
        if (input.volumes) {
            for (const volume of input.volumes) {
                args.push("-v", volume);
            }
        }
        // Add environment variables
        if (input.env) {
            for (const [key, value] of Object.entries(input.env)) {
                args.push("-e", `${key}=${value}`);
            }
        }
        // Add image
        args.push(input.image);
        // Add command if specified
        if (input.command) {
            args.push(...input.command.split(" "));
        }
        // Build command string
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
//# sourceMappingURL=run.js.map