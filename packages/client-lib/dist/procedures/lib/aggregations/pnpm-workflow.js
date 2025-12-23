/**
 * PNPM Workflow Aggregations
 *
 * Reusable pnpm patterns as aggregation definitions.
 */
/**
 * PNPM install and build workflow
 *
 * Pattern: pnpm install → pnpm run build
 * Used by: lib.refresh, lib.install
 */
export const pnpmInstallAndBuildAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Install dependencies
            {
                $proc: ["pnpm", "install"],
                $name: "install",
                input: {
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Verify install succeeded
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "install.success", invert: true },
                    then: {
                        $proc: ["client", "throw"],
                        input: {
                            message: "pnpm install failed: {{install.stderr}}",
                        },
                    },
                },
            },
            // Build the package
            {
                $proc: ["pnpm", "run"],
                $name: "build",
                input: {
                    script: "build",
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Verify build succeeded
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "build.success", invert: true },
                    then: {
                        $proc: ["client", "throw"],
                        input: {
                            message: "pnpm run build failed: {{build.stderr}}",
                        },
                    },
                },
            },
            // Return success result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    install: {
                        exitCode: { $ref: "install.exitCode" },
                        duration: { $ref: "install.duration" },
                    },
                    build: {
                        exitCode: { $ref: "build.exitCode" },
                        duration: { $ref: "build.duration" },
                    },
                },
            },
        ],
    },
};
/**
 * PNPM install only
 *
 * Pattern: pnpm install with options
 * Used by: various procedures needing just install
 */
export const pnpmInstallAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            {
                $proc: ["pnpm", "install"],
                $name: "install",
                input: {
                    cwd: { $ref: "input.cwd" },
                    packages: { $ref: "input.packages" },
                    dev: { $ref: "input.dev" },
                },
            },
            {
                $proc: ["client", "identity"],
                input: {
                    success: { $ref: "install.success" },
                    exitCode: { $ref: "install.exitCode" },
                    stdout: { $ref: "install.stdout" },
                    stderr: { $ref: "install.stderr" },
                    duration: { $ref: "install.duration" },
                },
            },
        ],
    },
};
//# sourceMappingURL=pnpm-workflow.js.map