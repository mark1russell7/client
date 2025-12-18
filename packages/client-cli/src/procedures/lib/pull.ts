/**
 * lib.pull procedure
 *
 * Pull from remote for all packages in dependency order.
 * Like lib.refresh --all but only does git pull (no install/build/push).
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type {
  LibPullInput,
  LibPullOutput,
  PullResult,
  DAGNode,
} from "../../types.js";
import { libScan } from "./scan.js";
import {
  buildDAGNodes,
  buildLeveledDAG,
  executeDAG,
  createProcessor,
} from "../../dag/index.js";

interface GitPullOutput {
  remote: string;
  branch: string;
  commits: number;
  fastForward: boolean;
}

/**
 * Pull from remote for a single package
 */
async function pullSinglePackage(
  pkgPath: string,
  packageName: string,
  ctx: ProcedureContext,
  options: { remote?: string; rebase?: boolean; dryRun?: boolean } = {}
): Promise<PullResult> {
  const startTime = Date.now();
  const { remote = "origin", rebase = false, dryRun = false } = options;

  if (dryRun) {
    return {
      name: packageName,
      path: pkgPath,
      success: true,
      duration: Date.now() - startTime,
      commits: 0,
      plannedOperations: [`git pull ${remote}`],
    };
  }

  try {
    const result = await ctx.client.call<
      { remote?: string; rebase?: boolean; cwd?: string },
      GitPullOutput
    >(
      ["git", "pull"],
      { remote, rebase, cwd: pkgPath }
    );

    return {
      name: packageName,
      path: pkgPath,
      success: true,
      duration: Date.now() - startTime,
      commits: result.commits,
      fastForward: result.fastForward,
    };
  } catch (error) {
    return {
      name: packageName,
      path: pkgPath,
      success: false,
      duration: Date.now() - startTime,
      commits: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pull from remote for all packages in dependency order
 */
export async function libPull(input: LibPullInput, ctx: ProcedureContext): Promise<LibPullOutput> {
  const startTime = Date.now();
  const results: PullResult[] = [];
  const pullOpts = {
    remote: input.remote,
    rebase: input.rebase,
    dryRun: input.dryRun,
  };

  // Scan for all packages
  const scanResult = await libScan({}, ctx);
  const allNodes = buildDAGNodes(scanResult.packages);

  // Build DAG for dependency-ordered execution
  const dag = buildLeveledDAG(allNodes);

  const processor = createProcessor(async (node: DAGNode) => {
    const result = await pullSinglePackage(node.repoPath, node.name, ctx, pullOpts);
    if (!result.success) {
      throw new Error(result.error ?? "Unknown error");
    }
  });

  const dagResult = await executeDAG(dag, processor, {
    concurrency: input.concurrency ?? 4,
    failFast: !input.continueOnError,
  });

  // Convert DAG results to pull results
  for (const [name, nodeResult] of dagResult.results) {
    const node = allNodes.get(name);
    const result: PullResult = {
      name,
      path: node?.repoPath ?? "unknown",
      success: nodeResult.success,
      duration: nodeResult.duration,
      commits: 0, // Will be filled from actual pull
    };
    if (nodeResult.error?.message !== undefined) {
      result.error = nodeResult.error.message;
    }
    results.push(result);
  }

  return {
    success: dagResult.success,
    results,
    totalDuration: Date.now() - startTime,
  };
}
