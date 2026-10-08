/**
 * lib.pull as an Aggregation Definition
 *
 * Converts the 135-line imperative lib.pull to a declarative aggregation.
 *
 * Pull from remote for all packages in dependency order.
 */

import type { AggregationDefinition } from "@mark1russell7/client";

/**
 * Pull single package aggregation
 *
 * git pull with optional rebase
 */
export const pullSinglePackageAggregation: AggregationDefinition = {
  $proc: ["client", "chain"],
  input: {
    steps: [
      // Dry-run mode: just report what would happen
      {
        $proc: ["client", "conditional"],
        $name: "dryRunResult",
        input: {
          condition: { $ref: "input.dryRun" },
          then: {
            $proc: ["client", "identity"],
            input: {
              success: true,
              dryRun: true,
              name: { $ref: "input.packageName" },
              path: { $ref: "input.cwd" },
              plannedOperations: ["git pull {{input.remote}}"],
            },
          },
        },
      },

      // Actual pull (skip if dry-run returned)
      {
        $proc: ["client", "conditional"],
        $name: "pullResult",
        input: {
          condition: { $ref: "input.dryRun", invert: true },
          then: {
            $proc: ["client", "tryCatch"],
            input: {
              try: {
                $proc: ["git", "pull"],
                input: {
                  remote: { $ref: "input.remote" },
                  rebase: { $ref: "input.rebase" },
                  cwd: { $ref: "input.cwd" },
                },
              },
              catch: {
                $proc: ["client", "identity"],
                input: {
                  success: false,
                  error: "Pull failed",
                },
              },
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
          commits: { $ref: "pullResult.commits" },
          fastForward: { $ref: "pullResult.fastForward" },
        },
      },
    ],
  },
};

/**
 * Full lib.pull aggregation
 *
 * Pull all packages in dependency order
 */
export const libPullAggregation: AggregationDefinition = {
  $proc: ["client", "chain"],
  input: {
    steps: [
      // Step 1: Scan ecosystem packages
      {
        $proc: ["lib", "scan"],
        $name: "scan",
        input: {},
      },

      // Step 2: Execute DAG (pull each package in order)
      {
        $proc: ["dag", "execute"],
        $name: "dagResult",
        input: {
          packages: { $ref: "scan.packages" },
          processor: {
            $proc: ["lib", "pull.single"],
            input: {
              cwd: { $ref: "node.repoPath" },
              packageName: { $ref: "node.name" },
              remote: { $ref: "input.remote" },
              rebase: { $ref: "input.rebase" },
              dryRun: { $ref: "input.dryRun" },
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
          results: { $ref: "dagResult.results" },
        },
      },
    ],
  },
};
