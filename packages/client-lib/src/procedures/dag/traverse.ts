/**
 * dag.traverse procedure
 *
 * General-purpose DAG traversal that executes a visit procedure
 * for each node in dependency order.
 *
 * This enables declarative composition of traversals:
 * ```typescript
 * // Execute git pull on all packages
 * await client.exec({
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: { $proc: ["git", "pull"], input: {} }
 *   }
 * });
 *
 * // Chain multiple operations per package
 * await client.exec({
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["client", "chain"],
 *       input: {
 *         steps: [
 *           { $proc: ["git", "add"], input: { all: true } },
 *           { $proc: ["git", "commit"], input: { message: "auto" } },
 *         ]
 *       }
 *     }
 *   }
 * });
 * ```
 */

import type { ProcedureContext, ProcedurePath } from "@mark1russell7/client";
import type {
  DAGNode,
  DagTraverseInput,
  DagTraverseOutput,
  TraverseNodeResult,
} from "../../types.js";
import { libScan } from "../lib/scan.js";
import {
  buildDAGNodes,
  buildLeveledDAG,
  executeDAG,
  createProcessor,
  filterDAGFromRoot,
} from "../../dag/index.js";

/**
 * Execute a DAG traversal with a custom visit procedure
 */
export async function dagTraverse(
  input: DagTraverseInput,
  ctx: ProcedureContext
): Promise<DagTraverseOutput> {
  const startTime = Date.now();
  const results: TraverseNodeResult[] = [];

  // Scan for all packages
  const scanResult = await libScan({}, ctx);
  let allNodes = buildDAGNodes(scanResult.packages);

  // Filter to specific packages if requested
  if (input.filter && input.filter.length > 0) {
    const filtered = new Map<string, DAGNode>();
    for (const name of input.filter) {
      const node = allNodes.get(name);
      if (node) {
        filtered.set(name, node);
      }
    }
    allNodes = filtered;
  }

  // Filter to root and its dependencies if requested
  if (input.root) {
    const rootNode = allNodes.get(input.root);
    if (!rootNode) {
      return {
        success: false,
        results: [],
        totalDuration: Date.now() - startTime,
        visited: 0,
        failed: 0,
      };
    }
    allNodes = filterDAGFromRoot(allNodes, input.root);
  }

  // Build DAG for dependency-ordered execution
  const dag = buildLeveledDAG(allNodes);

  // Determine visit procedure path and base input
  let visitPath: ProcedurePath;
  let baseInput: unknown = {};

  if (Array.isArray(input.visit)) {
    visitPath = input.visit;
  } else if (typeof input.visit === "object" && "$proc" in input.visit) {
    visitPath = input.visit.$proc;
    baseInput = input.visit.input ?? {};
  } else {
    throw new Error("visit must be a procedure path or $proc reference");
  }

  // Create processor that executes visit procedure per node
  const processor = createProcessor(async (node: DAGNode) => {
    if (input.dryRun) {
      results.push({
        name: node.name,
        path: node.repoPath,
        success: true,
        duration: 0,
        output: { dryRun: true, wouldExecute: visitPath },
      });
      return;
    }

    const nodeStartTime = Date.now();

    try {
      // Merge base input with node context
      const visitInput = {
        ...(typeof baseInput === "object" ? baseInput : {}),
        cwd: node.repoPath,
        node: {
          name: node.name,
          path: node.repoPath,
          dependencies: node.dependencies,
        },
      };

      // Execute visit procedure
      const output = await ctx.client.call(visitPath, visitInput);

      results.push({
        name: node.name,
        path: node.repoPath,
        success: true,
        duration: Date.now() - nodeStartTime,
        output,
      });
    } catch (error) {
      const result: TraverseNodeResult = {
        name: node.name,
        path: node.repoPath,
        success: false,
        duration: Date.now() - nodeStartTime,
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      throw error; // Re-throw for DAG executor to handle
    }
  });

  // Execute DAG traversal
  const dagResult = await executeDAG(dag, processor, {
    concurrency: input.concurrency ?? 4,
    failFast: !input.continueOnError,
  });

  // If dry run, we already populated results in the processor
  if (!input.dryRun) {
    // Ensure all nodes have results (some may have been skipped due to errors)
    for (const [name, nodeResult] of dagResult.results) {
      const existing = results.find((r) => r.name === name);
      if (!existing) {
        const node = allNodes.get(name);
        const result: TraverseNodeResult = {
          name,
          path: node?.repoPath ?? "unknown",
          success: nodeResult.success,
          duration: nodeResult.duration,
        };
        if (nodeResult.error?.message) {
          result.error = nodeResult.error.message;
        }
        results.push(result);
      }
    }
  }

  return {
    success: dagResult.success,
    results,
    totalDuration: Date.now() - startTime,
    visited: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
}
