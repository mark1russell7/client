/**
 * lib.install as an Aggregation Definition
 *
 * Converts the 231-line imperative lib.install to a declarative aggregation.
 *
 * Steps:
 * 1. Load ecosystem manifest
 * 2. Clone missing packages
 * 3. Scan and build DAG
 * 4. Install and build in DAG order
 */
/**
 * Clone missing package aggregation
 *
 * Checks if package exists, clones if not
 */
export const cloneMissingPackageAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Check if directory exists
            {
                $proc: ["fs", "exists"],
                $name: "exists",
                input: {
                    path: { $ref: "input.path" },
                },
            },
            // Clone if doesn't exist
            {
                $proc: ["client", "conditional"],
                $name: "clone",
                input: {
                    condition: { $ref: "exists.exists", invert: true },
                    then: {
                        $proc: ["client", "conditional"],
                        input: {
                            // Skip in dry-run mode
                            condition: { $ref: "input.dryRun" },
                            then: {
                                $proc: ["client", "identity"],
                                input: { wouldClone: true, skipped: true },
                            },
                            else: {
                                $proc: ["git", "clone"],
                                input: {
                                    url: { $ref: "input.url" },
                                    path: { $ref: "input.path" },
                                    branch: { $ref: "input.branch" },
                                },
                            },
                        },
                    },
                    else: {
                        $proc: ["client", "identity"],
                        input: { skipped: true, alreadyExists: true },
                    },
                },
            },
            // Return result
            {
                $proc: ["client", "identity"],
                input: {
                    name: { $ref: "input.name" },
                    path: { $ref: "input.path" },
                    existed: { $ref: "exists.exists" },
                    cloned: { $ref: "clone" },
                },
            },
        ],
    },
};
/**
 * Install single package aggregation
 *
 * pnpm install → pnpm run build
 */
export const installSinglePackageAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // pnpm install
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
            // pnpm run build
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
            // Return result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    name: { $ref: "input.packageName" },
                    path: { $ref: "input.cwd" },
                    phase: "complete",
                },
            },
        ],
    },
};
/**
 * Full lib.install aggregation
 *
 * Installs entire ecosystem:
 * 1. Load manifest
 * 2. Clone missing packages
 * 3. Install/build in DAG order
 */
export const libInstallAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Step 1: Resolve root path (default ~/git)
            {
                $proc: ["client", "identity"],
                $name: "config",
                input: {
                    rootPath: { $ref: "input.rootPath" },
                },
            },
            // Step 2: Load ecosystem manifest
            {
                $proc: ["client", "tryCatch"],
                $name: "manifest",
                input: {
                    try: {
                        $proc: ["fs", "read.json"],
                        input: {
                            path: "{{config.rootPath}}/ecosystem/ecosystem.manifest.json",
                        },
                    },
                    catch: {
                        $proc: ["client", "throw"],
                        input: {
                            message: "Could not load ecosystem manifest. Ensure ecosystem package is cloned.",
                        },
                    },
                },
            },
            // Step 3: Clone missing packages (using map over manifest entries)
            {
                $proc: ["client", "map"],
                $name: "cloneResults",
                input: {
                    items: { $ref: "manifest.data.packages" },
                    mapper: {
                        $proc: ["lib", "install.cloneMissing"],
                        input: {
                            name: { $ref: "item.key" },
                            path: "{{manifest.data.root}}/{{item.value.path}}",
                            url: { $ref: "item.value.repo" },
                            branch: { $ref: "item.value.branch" },
                            dryRun: { $ref: "input.dryRun" },
                        },
                    },
                },
            },
            // Step 4: Early exit if dry-run
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "input.dryRun" },
                    then: {
                        $proc: ["client", "identity"],
                        input: {
                            success: true,
                            dryRun: true,
                            cloneResults: { $ref: "cloneResults" },
                        },
                    },
                },
            },
            // Step 5: Scan and build DAG
            {
                $proc: ["lib", "scan"],
                $name: "scan",
                input: {
                    rootPath: { $ref: "manifest.data.root" },
                },
            },
            // Step 6: Execute DAG (install + build each package)
            {
                $proc: ["dag", "execute"],
                $name: "dagResult",
                input: {
                    packages: { $ref: "scan.packages" },
                    processor: {
                        $proc: ["lib", "install.single"],
                        input: {
                            cwd: { $ref: "node.repoPath" },
                            packageName: { $ref: "node.name" },
                        },
                    },
                    concurrency: { $ref: "input.concurrency" },
                    failFast: { $ref: "input.continueOnError", invert: true },
                },
            },
            // Return final result
            {
                $proc: ["client", "identity"],
                input: {
                    success: { $ref: "dagResult.success" },
                    cloned: { $ref: "cloneResults" },
                    results: { $ref: "dagResult.results" },
                },
            },
        ],
    },
};
//# sourceMappingURL=install-aggregation.js.map