/**
 * test.coverage procedure
 *
 * Run tests with coverage reporting.
 */
export async function testCoverage(input, ctx) {
    const startTime = Date.now();
    // Build vitest command with coverage
    const args = ["vitest", "run", "--coverage"];
    if (input.pattern) {
        args.push(input.pattern);
    }
    // Execute via shell.exec
    const result = await ctx.client.call(["shell", "exec"], {
        command: args.join(" "),
        cwd: input.cwd,
    });
    const shellResult = result;
    // Try to parse coverage percentage from output
    let coverage;
    const coverageMatch = shellResult.stdout.match(/All files[^|]*\|\s*([\d.]+)/);
    if (coverageMatch) {
        coverage = parseFloat(coverageMatch[1] ?? "0");
    }
    // Check threshold if specified
    let success = shellResult.exitCode === 0;
    if (success && input.threshold !== undefined && coverage !== undefined) {
        success = coverage >= input.threshold;
    }
    return {
        success,
        exitCode: shellResult.exitCode,
        stdout: shellResult.stdout,
        stderr: shellResult.stderr,
        duration: Date.now() - startTime,
        coverage,
    };
}
//# sourceMappingURL=coverage.js.map