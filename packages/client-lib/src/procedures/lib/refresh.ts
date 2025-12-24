/**
 * lib.refresh procedure
 *
 * Refreshes a library by:
 * 1. rm -rf node_modules/, dist/, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm run build
 * 4. git add -A && git commit && git push
 *
 * With --recursive, processes dependencies in post-order (bottom-up).
 *
 * @deprecated This imperative implementation is deprecated.
 * Use the aggregation version via `registerAggregationProcedures()` instead:
 * - Import: `import { registerAggregationProcedures } from "@mark1russell7/client-lib"`
 * - Register: `await registerAggregationProcedures(client)`
 * - Call: `await client.call(["agg", "lib", "refresh"], input)`
 *
 * The aggregation version (libRefreshAggregation) provides:
 * - Declarative JSON-serializable definition
 * - Runtime introspection
 * - Consistent error handling via the aggregation executor
 *
 * This imperative version will be removed in v2.0.
 */

import { join } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type {
  LibRefreshInput,
  LibRefreshOutput,
  RefreshResult,
  DAGNode,
} from "../../types.js";
import { libScan } from "./scan.js";
import {
  buildDAGNodes,
  filterDAGFromRoot,
  buildLeveledDAG,
  executeDAG,
  createProcessor,
} from "../../dag/index.js";
import { ensureBranch, stageAll, commit, push, getGitStatus } from "../../git/index.js";

interface FsExistsOutput { exists: boolean; path: string; }
interface FsReadJsonOutput<T> { path: string; data: T; }

interface PackageJson {
  name?: string;
}

/**
 * Read the package name from a package.json
 */
async function getPackageName(pkgPath: string, ctx: ProcedureContext): Promise<string> {
  const pkgJsonPath = join(pkgPath, "package.json");
  const result = await ctx.client.call<{ path: string }, FsReadJsonOutput<PackageJson>>(
    ["fs", "read.json"],
    { path: pkgJsonPath }
  );
  return result.data.name ?? "unknown";
}

/**
 * Check if a path exists
 */
async function pathExists(pathStr: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path: pathStr }
    );
    return result.exists;
  } catch {
    return false;
  }
}

interface RefreshOptions {
  force?: boolean;
  skipGit?: boolean;
  dryRun?: boolean;
}

/**
 * Refresh a single package
 *
 * @param pkgPath - Path to the package
 * @param packageName - Name of the package
 * @param options - Refresh options
 *   - force: If true, removes node_modules, dist, and pnpm-lock.yaml before install
 *   - skipGit: If true, skips git commit/push
 *   - dryRun: If true, only reports what would be done without executing
 */
async function refreshSinglePackage(
  pkgPath: string,
  packageName: string,
  ctx: ProcedureContext,
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  const startTime = Date.now();
  const { force = false, skipGit = false, dryRun = false } = options;
  const plannedOperations: string[] = [];

  // Dry-run mode: collect planned operations
  if (dryRun) {
    if (force) {
      const nodeModulesPath = join(pkgPath, "node_modules");
      const distPath = join(pkgPath, "dist");
      const lockPath = join(pkgPath, "pnpm-lock.yaml");
      const tsBuildInfoPath = join(pkgPath, "tsconfig.tsbuildinfo");

      if (await pathExists(nodeModulesPath, ctx)) {
        plannedOperations.push("DELETE node_modules/");
      }
      if (await pathExists(distPath, ctx)) {
        plannedOperations.push("DELETE dist/");
      }
      if (await pathExists(lockPath, ctx)) {
        plannedOperations.push("DELETE pnpm-lock.yaml");
      }
      if (await pathExists(tsBuildInfoPath, ctx)) {
        plannedOperations.push("DELETE tsconfig.tsbuildinfo");
      }
    }

    plannedOperations.push("RUN pnpm install");
    plannedOperations.push("RUN pnpm run build");

    if (!skipGit) {
      try {
        const status = await getGitStatus(pkgPath, ctx);
        if (!status.isClean) {
          plannedOperations.push("GIT add -A");
          plannedOperations.push("GIT commit");
          plannedOperations.push("GIT push");
        } else {
          plannedOperations.push("GIT (no changes to commit)");
        }
      } catch {
        plannedOperations.push("GIT commit and push (if changes)");
      }
    } else {
      plannedOperations.push("GIT (skipped)");
    }

    return {
      name: packageName,
      path: pkgPath,
      success: true,
      duration: Date.now() - startTime,
      plannedOperations,
    };
  }

  // Actual execution
  try {
    // Step 1: Cleanup (only if force is true)
    if (force) {
      const nodeModulesPath = join(pkgPath, "node_modules");
      const distPath = join(pkgPath, "dist");
      const lockPath = join(pkgPath, "pnpm-lock.yaml");
      const tsBuildInfoPath = join(pkgPath, "tsconfig.tsbuildinfo");

      if (await pathExists(nodeModulesPath, ctx)) {
        try {
          await ctx.client.call<{ path: string; recursive?: boolean; force?: boolean }, { removed: boolean }>(
            ["fs", "rm"],
            { path: nodeModulesPath, recursive: true, force: true }
          );
        } catch (error) {
          return {
            name: packageName,
            path: pkgPath,
            success: false,
            duration: Date.now() - startTime,
            error: `Failed to remove node_modules: ${error instanceof Error ? error.message : String(error)}`,
            failedPhase: "cleanup",
          };
        }
      }

      if (await pathExists(distPath, ctx)) {
        try {
          await ctx.client.call<{ path: string; recursive?: boolean; force?: boolean }, { removed: boolean }>(
            ["fs", "rm"],
            { path: distPath, recursive: true, force: true }
          );
        } catch (error) {
          return {
            name: packageName,
            path: pkgPath,
            success: false,
            duration: Date.now() - startTime,
            error: `Failed to remove dist: ${error instanceof Error ? error.message : String(error)}`,
            failedPhase: "cleanup",
          };
        }
      }

      if (await pathExists(lockPath, ctx)) {
        try {
          await ctx.client.call<{ path: string; force?: boolean }, { removed: boolean }>(
            ["fs", "rm"],
            { path: lockPath, force: true }
          );
        } catch (error) {
          return {
            name: packageName,
            path: pkgPath,
            success: false,
            duration: Date.now() - startTime,
            error: `Failed to remove pnpm-lock.yaml: ${error instanceof Error ? error.message : String(error)}`,
            failedPhase: "cleanup",
          };
        }
      }

      if (await pathExists(tsBuildInfoPath, ctx)) {
        try {
          await ctx.client.call<{ path: string; force?: boolean }, { removed: boolean }>(
            ["fs", "rm"],
            { path: tsBuildInfoPath, force: true }
          );
        } catch (error) {
          return {
            name: packageName,
            path: pkgPath,
            success: false,
            duration: Date.now() - startTime,
            error: `Failed to remove tsconfig.tsbuildinfo: ${error instanceof Error ? error.message : String(error)}`,
            failedPhase: "cleanup",
          };
        }
      }
    }

    // Step 2: pnpm install
    const installResult = await ctx.client.call<
      { cwd?: string },
      { exitCode: number; stdout: string; stderr: string; success: boolean; duration: number }
    >(["pnpm", "install"], { cwd: pkgPath });
    if (!installResult.success) {
      return {
        name: packageName,
        path: pkgPath,
        success: false,
        duration: Date.now() - startTime,
        error: `pnpm install failed: ${installResult.stderr}`,
        failedPhase: "install",
      };
    }

    // Step 3: pnpm run build
    const buildResult = await ctx.client.call<
      { script: string; cwd?: string },
      { exitCode: number; stdout: string; stderr: string; success: boolean; duration: number }
    >(["pnpm", "run"], { script: "build", cwd: pkgPath });
    if (!buildResult.success) {
      return {
        name: packageName,
        path: pkgPath,
        success: false,
        duration: Date.now() - startTime,
        error: `pnpm run build failed: ${buildResult.stderr}`,
        failedPhase: "build",
      };
    }

    // Step 4: Git operations (unless skipGit is true)
    // Always run add/commit/push - they handle no-op cases gracefully
    if (!skipGit) {
      try {
        await stageAll(pkgPath, ctx);
        await commit(
          pkgPath,
          `Refreshed package ${packageName}\n\n🤖 Generated with mark lib refresh`,
          ctx
        );
        await push(pkgPath, ctx);
      } catch (error) {
        return {
          name: packageName,
          path: pkgPath,
          success: false,
          duration: Date.now() - startTime,
          error: `Git operations failed: ${error instanceof Error ? error.message : String(error)}`,
          failedPhase: "git",
        };
      }
    }

    return {
      name: packageName,
      path: pkgPath,
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: packageName,
      path: pkgPath,
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Refresh a package and optionally its dependencies recursively
 *
 * @deprecated Use libRefreshAggregation via registerAggregationProcedures() instead.
 * This imperative version will be removed in v2.0.
 */
export async function libRefresh(input: LibRefreshInput, ctx: ProcedureContext): Promise<LibRefreshOutput> {
  const startTime = Date.now();
  const results: RefreshResult[] = [];
  const refreshOpts: RefreshOptions = {
    force: input.force,
    skipGit: input.skipGit,
    dryRun: input.dryRun,
  };

  // Scan for all packages first (needed for --all and --recursive)
  const scanResult = await libScan({}, ctx);
  const allNodes = buildDAGNodes(scanResult.packages);

  // Handle --all flag: refresh all ecosystem packages
  if (input.all) {
    const dag = buildLeveledDAG(allNodes);

    const processor = createProcessor(async (node: DAGNode) => {
      await ensureBranch(node.repoPath, node.requiredBranch, ctx);
      const result = await refreshSinglePackage(node.repoPath, node.name, ctx, refreshOpts);
      if (!result.success) {
        throw new Error(result.error ?? "Unknown error");
      }
    });

    const dagResult = await executeDAG(dag, processor, {
      concurrency: 4,
      failFast: !input.autoConfirm,
    });

    for (const [name, nodeResult] of dagResult.results) {
      const node = allNodes.get(name);
      const result: RefreshResult = {
        name,
        path: node?.repoPath ?? "unknown",
        success: nodeResult.success,
        duration: nodeResult.duration,
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

  // Get the absolute path for single package mode
  const pkgPath = input.path.startsWith("/") || input.path.includes(":")
    ? input.path
    : join(process.cwd(), input.path);

  // Get the package name
  const packageName = await getPackageName(pkgPath, ctx);

  if (!input.recursive) {
    // Non-recursive: just refresh the single package
    const result = await refreshSinglePackage(pkgPath, packageName, ctx, refreshOpts);
    results.push(result);

    return {
      success: result.success,
      results,
      totalDuration: Date.now() - startTime,
    };
  }

  // Recursive: filter to only include this package and its dependencies
  const filteredNodes = filterDAGFromRoot(allNodes, packageName);

  if (filteredNodes.size === 0) {
    // Package not found in scan, just refresh it directly
    const result = await refreshSinglePackage(pkgPath, packageName, ctx, refreshOpts);
    results.push(result);

    return {
      success: result.success,
      results,
      totalDuration: Date.now() - startTime,
    };
  }

  // Build leveled DAG for parallel execution
  const dag = buildLeveledDAG(filteredNodes);

  // Execute DAG (bottom-up, level 0 first)
  const processor = createProcessor(async (node: DAGNode) => {
    // Ensure we're on the correct branch
    await ensureBranch(node.repoPath, node.requiredBranch, ctx);

    // Refresh the package
    const result = await refreshSinglePackage(node.repoPath, node.name, ctx, refreshOpts);

    if (!result.success) {
      throw new Error(result.error ?? "Unknown error");
    }
  });

  const dagResult = await executeDAG(dag, processor, {
    concurrency: 4,
    failFast: !input.autoConfirm, // Stop on error unless auto-confirm
  });

  // Convert DAG results to refresh results
  for (const [name, nodeResult] of dagResult.results) {
    const node = filteredNodes.get(name);
    const result: RefreshResult = {
      name,
      path: node?.repoPath ?? "unknown",
      success: nodeResult.success,
      duration: nodeResult.duration,
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
