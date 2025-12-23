/**
 * lib.refresh as an Aggregation Definition
 *
 * This demonstrates converting the 427-line imperative lib.refresh
 * to a declarative aggregation using composition of reusable primitives.
 *
 * The aggregation approach:
 * 1. Compose reusable primitives (cleanup, pnpm workflow, git workflow)
 * 2. Use $when to control conditional execution
 * 3. DAG execution for recursive mode handled by dag.execute procedure
 */
/**
 * Single package refresh aggregation
 *
 * Steps:
 * 1. (Conditional) Force cleanup: rm node_modules, dist, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm run build
 * 4. (Conditional) Git commit and push
 */
export const refreshSinglePackageAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Step 1: Force cleanup (conditional)
            {
                $proc: ["client", "conditional"],
                $name: "cleanup",
                input: {
                    condition: { $ref: "input.force" },
                    then: {
                        $proc: ["client", "chain"],
                        input: {
                            steps: [
                                // Remove node_modules
                                {
                                    $proc: ["client", "tryCatch"],
                                    input: {
                                        try: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/node_modules",
                                                recursive: true,
                                                force: true,
                                            },
                                        },
                                        catch: { removed: false },
                                    },
                                },
                                // Remove dist
                                {
                                    $proc: ["client", "tryCatch"],
                                    input: {
                                        try: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/dist",
                                                recursive: true,
                                                force: true,
                                            },
                                        },
                                        catch: { removed: false },
                                    },
                                },
                                // Remove pnpm-lock.yaml
                                {
                                    $proc: ["client", "tryCatch"],
                                    input: {
                                        try: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/pnpm-lock.yaml",
                                                force: true,
                                            },
                                        },
                                        catch: { removed: false },
                                    },
                                },
                                // Remove tsconfig.tsbuildinfo
                                {
                                    $proc: ["client", "tryCatch"],
                                    input: {
                                        try: {
                                            $proc: ["fs", "rm"],
                                            input: {
                                                path: "{{input.cwd}}/tsconfig.tsbuildinfo",
                                                force: true,
                                            },
                                        },
                                        catch: { removed: false },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            // Step 2: pnpm install
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
                            message: "pnpm install failed",
                        },
                    },
                },
            },
            // Step 3: pnpm run build
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
                            message: "pnpm run build failed",
                        },
                    },
                },
            },
            // Step 4: Git operations (conditional)
            {
                $proc: ["client", "conditional"],
                $name: "git",
                input: {
                    condition: { $ref: "input.skipGit", invert: true },
                    then: {
                        $proc: ["client", "tryCatch"],
                        input: {
                            try: {
                                $proc: ["client", "chain"],
                                input: {
                                    steps: [
                                        {
                                            $proc: ["git", "add"],
                                            input: {
                                                all: true,
                                                cwd: { $ref: "input.cwd" },
                                            },
                                        },
                                        {
                                            $proc: ["git", "commit"],
                                            input: {
                                                message: "Refreshed package {{input.packageName}}\n\n🤖 Generated with mark lib refresh",
                                                cwd: { $ref: "input.cwd" },
                                            },
                                        },
                                        {
                                            $proc: ["git", "push"],
                                            input: {
                                                cwd: { $ref: "input.cwd" },
                                            },
                                        },
                                    ],
                                },
                            },
                            catch: { error: "Git operations failed" },
                        },
                    },
                },
            },
            // Return result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    name: { $ref: "input.packageName" },
                    path: { $ref: "input.cwd" },
                    operations: {
                        cleanup: { $ref: "cleanup" },
                        install: { $ref: "install.success" },
                        build: { $ref: "build.success" },
                        git: { $ref: "git" },
                    },
                },
            },
        ],
    },
};
/**
 * Full lib.refresh aggregation
 *
 * Handles:
 * - Single package refresh
 * - --all flag for entire ecosystem
 * - --recursive flag for dependency tree
 * - --dry-run for planning
 */
export const libRefreshAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Step 1: Scan ecosystem packages
            {
                $proc: ["lib", "scan"],
                $name: "scan",
                input: {},
            },
            // Step 2: Branch based on mode (all, recursive, single)
            {
                $proc: ["client", "conditional"],
                $name: "result",
                input: {
                    // All mode: refresh entire ecosystem
                    condition: { $ref: "input.all" },
                    then: {
                        $proc: ["dag", "execute"],
                        input: {
                            packages: { $ref: "scan.packages" },
                            processor: {
                                $proc: ["lib", "refresh.single"],
                                input: {
                                    cwd: { $ref: "node.repoPath" },
                                    packageName: { $ref: "node.name" },
                                    force: { $ref: "input.force" },
                                    skipGit: { $ref: "input.skipGit" },
                                    dryRun: { $ref: "input.dryRun" },
                                },
                            },
                            concurrency: 4,
                            failFast: { $ref: "input.autoConfirm", invert: true },
                        },
                    },
                    else: {
                        // Single or recursive mode
                        $proc: ["client", "conditional"],
                        input: {
                            condition: { $ref: "input.recursive" },
                            then: {
                                // Recursive: filter DAG to package and dependencies
                                $proc: ["dag", "execute"],
                                input: {
                                    packages: { $ref: "scan.packages" },
                                    filterRoot: { $ref: "input.packageName" },
                                    processor: {
                                        $proc: ["lib", "refresh.single"],
                                        input: {
                                            cwd: { $ref: "node.repoPath" },
                                            packageName: { $ref: "node.name" },
                                            force: { $ref: "input.force" },
                                            skipGit: { $ref: "input.skipGit" },
                                            dryRun: { $ref: "input.dryRun" },
                                        },
                                    },
                                    concurrency: 4,
                                    failFast: { $ref: "input.autoConfirm", invert: true },
                                },
                            },
                            else: {
                                // Single package mode
                                $proc: ["lib", "refresh.single"],
                                input: {
                                    cwd: { $ref: "input.path" },
                                    packageName: { $ref: "input.packageName" },
                                    force: { $ref: "input.force" },
                                    skipGit: { $ref: "input.skipGit" },
                                    dryRun: { $ref: "input.dryRun" },
                                },
                            },
                        },
                    },
                },
            },
            // Return final result
            {
                $proc: ["client", "identity"],
                input: {
                    success: { $ref: "result.success" },
                    results: { $ref: "result.results" },
                },
            },
        ],
    },
};
//# sourceMappingURL=refresh-aggregation.js.map