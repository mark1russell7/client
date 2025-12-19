/**
 * test.run procedure
 *
 * Run tests for a package using vitest.
 */
export async function testRun(input, ctx) {
    const startTime = Date.now();
    // Build vitest command
    const args = ["vitest"];
    if (input.watch) {
        // Watch mode - just "vitest" without "run"
    }
    else {
        args.push("run");
    }
    if (input.pattern) {
        args.push(input.pattern);
    }
    if (input.coverage) {
        args.push("--coverage");
    }
    if (input.reporter) {
        args.push("--reporter", input.reporter);
    }
    // Execute via shell.exec
    const result = await ctx.client.call(["shell", "exec"], {
        command: args.join(" "),
        cwd: input.cwd,
        timeout: input.timeout,
    });
    const shellResult = result;
    return {
        success: shellResult.exitCode === 0,
        exitCode: shellResult.exitCode,
        stdout: shellResult.stdout,
        stderr: shellResult.stderr,
        duration: Date.now() - startTime,
    };
}
//# sourceMappingURL=run.js.map