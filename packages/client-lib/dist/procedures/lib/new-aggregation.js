/**
 * lib.new as an Aggregation Definition
 *
 * This file demonstrates converting lib.new from imperative code to a declarative
 * aggregation using the procedure.define meta-procedure pattern.
 *
 * The aggregation approach:
 * 1. Define steps as procedure references ($proc)
 * 2. Use $ref to reference input and previous results
 * 3. Use $when to control conditional execution
 * 4. Use $name to capture outputs for later reference
 *
 * Benefits:
 * - Declarative, composable, and serializable
 * - Can be stored, loaded, and modified at runtime
 * - Automatic parallelization where possible
 * - Clear dependency graph
 */
/**
 * Aggregation definition for lib.new
 *
 * This demonstrates how the 250-line imperative lib.new could be expressed
 * as a ~60 line declarative aggregation.
 */
export const libNewAggregation = {
    $proc: ["client", "chain"],
    input: {
        // Input schema reference
        cwd: { $ref: "input.rootPath" },
        steps: [
            // Step 1: Resolve paths
            {
                $proc: ["client", "identity"],
                $name: "paths",
                input: {
                    rootPath: { $ref: "input.rootPath" },
                    name: { $ref: "input.name" },
                    packagePath: "{{rootPath}}/{{name}}", // Template syntax
                    packageName: "@mark1russell7/{{name}}",
                },
            },
            // Step 2: Load manifest (optional - may not exist)
            {
                $proc: ["client", "tryCatch"],
                $name: "manifest",
                input: {
                    try: {
                        $proc: ["fs", "read.json"],
                        input: {
                            path: "{{paths.rootPath}}/ecosystem/ecosystem.manifest.json",
                        },
                    },
                    catch: {
                        projectTemplate: {
                            files: ["package.json", "tsconfig.json", "dependencies.json", ".gitignore"],
                            dirs: ["src", "dist"],
                        },
                    },
                },
            },
            // Step 3: Check if package exists
            {
                $proc: ["fs", "exists"],
                $name: "exists",
                input: {
                    path: { $ref: "paths.packagePath" },
                },
            },
            // Step 4: Fail if exists
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "exists.exists" },
                    then: {
                        $proc: ["client", "throw"],
                        input: { message: "Package already exists" },
                    },
                },
            },
            // Step 5: Create directory structure
            {
                $proc: ["fs", "mkdir"],
                $name: "mkdir",
                input: {
                    path: { $ref: "paths.packagePath" },
                    recursive: true,
                },
            },
            // Step 6: Create subdirectories (parallel)
            {
                $proc: ["client", "parallel"],
                input: {
                    tasks: [
                        {
                            $proc: ["fs", "mkdir"],
                            input: {
                                path: "{{paths.packagePath}}/src",
                                recursive: true,
                            },
                        },
                    ],
                },
            },
            // Step 7: Create entry point
            {
                $proc: ["fs", "write"],
                input: {
                    path: "{{paths.packagePath}}/src/index.ts",
                    content: "// Entry point\nexport {};\n",
                },
            },
            // Step 8: Run cue-config init
            {
                $proc: ["shell", "exec"],
                input: {
                    command: "npx cue-config init --preset {{input.preset}} --force",
                    cwd: { $ref: "paths.packagePath" },
                },
            },
            // Step 9: Run cue-config generate
            {
                $proc: ["shell", "exec"],
                input: {
                    command: "npx cue-config generate",
                    cwd: { $ref: "paths.packagePath" },
                },
            },
            // Step 10: Git operations (conditional)
            {
                $proc: ["client", "conditional"],
                $when: "immediate",
                input: {
                    condition: { $ref: "input.skipGit", invert: true },
                    then: {
                        $proc: ["client", "chain"],
                        input: {
                            cwd: { $ref: "paths.packagePath" },
                            steps: [
                                { $proc: ["git", "init"], input: {} },
                                { $proc: ["git", "add"], input: { all: true } },
                                { $proc: ["git", "commit"], input: { message: "Initial commit" } },
                                {
                                    $proc: ["shell", "exec"],
                                    input: {
                                        command: "gh repo create mark1russell7/{{input.name}} --private --source . --push",
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            // Step 11: Update manifest (conditional)
            {
                $proc: ["client", "conditional"],
                $when: "immediate",
                input: {
                    condition: { $ref: "input.skipManifest", invert: true },
                    then: {
                        $proc: ["lib", "manifest.add"],
                        input: {
                            packageName: { $ref: "paths.packageName" },
                            repo: "github:mark1russell7/{{input.name}}#main",
                            path: { $ref: "input.name" },
                        },
                    },
                },
            },
            // Final: Return result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    packageName: { $ref: "paths.packageName" },
                    packagePath: { $ref: "paths.packagePath" },
                    operations: [
                        "Created directory structure",
                        "Ran cue-config init",
                        "Ran cue-config generate",
                        "Initialized git",
                        "Created GitHub repo",
                        "Updated manifest",
                    ],
                },
            },
        ],
    },
};
/**
 * Helper aggregation: lib.scaffold
 *
 * Creates just the directory structure without git or manifest.
 * Demonstrates a simpler aggregation that can be composed with lib.new.
 */
export const libScaffoldAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Create root directory
            {
                $proc: ["fs", "mkdir"],
                $name: "root",
                input: {
                    path: { $ref: "input.path" },
                    recursive: true,
                },
            },
            // Create subdirectories in parallel
            {
                $proc: ["client", "parallel"],
                input: {
                    tasks: [
                        {
                            $proc: ["fs", "mkdir"],
                            input: { path: "{{input.path}}/src", recursive: true },
                        },
                    ],
                },
            },
            // Create entry point
            {
                $proc: ["fs", "write"],
                input: {
                    path: "{{input.path}}/src/index.ts",
                    content: "// Entry point\nexport {};\n",
                },
            },
            // Return result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    path: { $ref: "input.path" },
                    created: ["src/", "src/index.ts"],
                },
            },
        ],
    },
};
/**
 * Git workflow aggregation
 *
 * Reusable aggregation for git init + add + commit + push pattern.
 * Can be composed with other aggregations.
 */
export const gitInitWorkflowAggregation = {
    $proc: ["client", "chain"],
    input: {
        // cwd propagates through the chain
        steps: [
            { $proc: ["git", "init"], input: {} },
            { $proc: ["git", "add"], input: { all: true } },
            {
                $proc: ["git", "commit"],
                $name: "commit",
                input: { message: { $ref: "input.message" } },
            },
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "input.push" },
                    then: {
                        $proc: ["git", "push"],
                        input: { setUpstream: true },
                    },
                },
            },
        ],
    },
};
//# sourceMappingURL=new-aggregation.js.map