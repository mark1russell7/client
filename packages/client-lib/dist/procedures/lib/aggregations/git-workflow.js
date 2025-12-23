/**
 * Git Workflow Aggregations
 *
 * Reusable git patterns as aggregation definitions.
 */
/**
 * Git commit and push workflow
 *
 * Pattern: stage all → commit → push
 * Used by: lib.refresh, lib.new
 */
export const gitCommitAndPushAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Stage all changes
            {
                $proc: ["git", "add"],
                $name: "staged",
                input: {
                    all: true,
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Commit with message
            {
                $proc: ["git", "commit"],
                $name: "commit",
                input: {
                    message: { $ref: "input.message" },
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Push to remote
            {
                $proc: ["git", "push"],
                $name: "push",
                input: {
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Return result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    staged: { $ref: "staged" },
                    commit: { $ref: "commit" },
                    pushed: true,
                },
            },
        ],
    },
};
/**
 * Git init workflow for new packages
 *
 * Pattern: init → add all → commit → create remote → push
 * Used by: lib.new
 */
export const gitInitWorkflowAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            // Initialize repository
            {
                $proc: ["git", "init"],
                $name: "init",
                input: {
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Stage all files
            {
                $proc: ["git", "add"],
                $name: "staged",
                input: {
                    all: true,
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Initial commit
            {
                $proc: ["git", "commit"],
                $name: "commit",
                input: {
                    message: { $ref: "input.message" },
                    cwd: { $ref: "input.cwd" },
                },
            },
            // Create GitHub repo and push (conditional)
            {
                $proc: ["client", "conditional"],
                input: {
                    condition: { $ref: "input.createRemote" },
                    then: {
                        $proc: ["shell", "exec"],
                        input: {
                            command: "gh repo create {{input.repoOwner}}/{{input.repoName}} --private --source . --push",
                            cwd: { $ref: "input.cwd" },
                        },
                    },
                },
            },
            // Return result
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    initialized: true,
                    committed: { $ref: "commit" },
                },
            },
        ],
    },
};
/**
 * Git pull with optional rebase
 *
 * Pattern: pull (with rebase option)
 * Used by: lib.pull
 */
export const gitPullAggregation = {
    $proc: ["client", "chain"],
    input: {
        steps: [
            {
                $proc: ["git", "pull"],
                $name: "pull",
                input: {
                    remote: { $ref: "input.remote" },
                    rebase: { $ref: "input.rebase" },
                    cwd: { $ref: "input.cwd" },
                },
            },
            {
                $proc: ["client", "identity"],
                input: {
                    success: true,
                    commits: { $ref: "pull.commits" },
                    fastForward: { $ref: "pull.fastForward" },
                },
            },
        ],
    },
};
//# sourceMappingURL=git-workflow.js.map