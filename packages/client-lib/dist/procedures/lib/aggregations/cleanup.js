/**
 * Cleanup Aggregations
 *
 * File/directory cleanup patterns as aggregation definitions.
 */
/**
 * Force cleanup for package refresh
 *
 * Pattern: Remove node_modules, dist, pnpm-lock.yaml, tsconfig.tsbuildinfo
 * Used by: lib.refresh --force
 */
export const forceCleanupAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Remove node_modules if exists
            {
                $proc: ["client", "tryCatch"],
                $name: "nodeModules",
                input: {
                    try: {
                        $proc: ["client", "chain"],
                        input: {
                            steps: [
                                {
                                    $proc: ["fs", "exists"],
                                    $name: "check",
                                    input: { path: "{{input.cwd}}/node_modules" },
                                },
                                {
                                    $proc: ["client", "conditional"],
                                    input: {
                                        condition: { $ref: "check.exists" },
                                        then: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/node_modules",
                                                recursive: true,
                                                force: true,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    catch: { removed: false, error: "Failed to remove node_modules" },
                },
            },
            // Remove dist if exists
            {
                $proc: ["client", "tryCatch"],
                $name: "dist",
                input: {
                    try: {
                        $proc: ["client", "chain"],
                        input: {
                            steps: [
                                {
                                    $proc: ["fs", "exists"],
                                    $name: "check",
                                    input: { path: "{{input.cwd}}/dist" },
                                },
                                {
                                    $proc: ["client", "conditional"],
                                    input: {
                                        condition: { $ref: "check.exists" },
                                        then: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/dist",
                                                recursive: true,
                                                force: true,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    catch: { removed: false, error: "Failed to remove dist" },
                },
            },
            // Remove pnpm-lock.yaml if exists
            {
                $proc: ["client", "tryCatch"],
                $name: "lock",
                input: {
                    try: {
                        $proc: ["client", "chain"],
                        input: {
                            steps: [
                                {
                                    $proc: ["fs", "exists"],
                                    $name: "check",
                                    input: { path: "{{input.cwd}}/pnpm-lock.yaml" },
                                },
                                {
                                    $proc: ["client", "conditional"],
                                    input: {
                                        condition: { $ref: "check.exists" },
                                        then: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/pnpm-lock.yaml",
                                                force: true,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    catch: { removed: false, error: "Failed to remove pnpm-lock.yaml" },
                },
            },
            // Remove tsconfig.tsbuildinfo if exists
            {
                $proc: ["client", "tryCatch"],
                $name: "tsbuildinfo",
                input: {
                    try: {
                        $proc: ["client", "chain"],
                        input: {
                            steps: [
                                {
                                    $proc: ["fs", "exists"],
                                    $name: "check",
                                    input: { path: "{{input.cwd}}/tsconfig.tsbuildinfo" },
                                },
                                {
                                    $proc: ["client", "conditional"],
                                    input: {
                                        condition: { $ref: "check.exists" },
                                        then: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/tsconfig.tsbuildinfo",
                                                force: true,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    catch: { removed: false, error: "Failed to remove tsconfig.tsbuildinfo" },
                },
            },
            // Return cleanup summary
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    cleaned: {
                        nodeModules: { $ref: "nodeModules" },
                        dist: { $ref: "dist" },
                        lock: { $ref: "lock" },
                        tsbuildinfo: { $ref: "tsbuildinfo" },
                    },
                },
            },
        ],
    },
};
/**
 * Ensure directory exists (mkdir -p equivalent)
 *
 * Pattern: Check exists → mkdir if not
 * Used by: lib.new, various scaffold procedures
 */
export const ensureDirAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            {
                $proc: ["fs", "exists"],
                $name: "check",
                input: { path: { $ref: "input.path" } },
            },
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "check.exists", invert: true },
                    then: {
                        $proc: ["fs", "mkdir"],
                        input: {
                            path: { $ref: "input.path" },
                            recursive: true,
                        },
                    },
                },
            },
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    path: { $ref: "input.path" },
                    created: { $ref: "check.exists", invert: true },
                },
            },
        ],
    },
};
//# sourceMappingURL=cleanup.js.map