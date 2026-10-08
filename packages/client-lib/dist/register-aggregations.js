/**
 * Aggregation Registration via procedure.define
 *
 * This module registers aggregation-based versions of lib procedures
 * using the procedure.define meta-procedure system.
 *
 * Usage:
 * ```typescript
 * import { registerAggregationProcedures } from "@mark1russell7/client-lib/register-aggregations";
 *
 * // Register with a client that has procedure.define available
 * await registerAggregationProcedures(client);
 * ```
 *
 * The aggregation versions are registered alongside the imperative versions
 * with different paths (lib.new.agg, lib.refresh.agg, etc.) for testing.
 * Once validated, they can replace the imperative versions.
 */
// Import aggregation definitions
import { libNewAggregation, libScaffoldAggregation } from "./procedures/lib/new-aggregation.js";
import { refreshSinglePackageAggregation, libRefreshAggregation, } from "./procedures/lib/refresh-aggregation.js";
import { cloneMissingPackageAggregation, installSinglePackageAggregation, libInstallAggregation, } from "./procedures/lib/install-aggregation.js";
import { pullSinglePackageAggregation, libPullAggregation, } from "./procedures/lib/pull-aggregation.js";
// Import aggregation primitives
import { gitCommitAndPushAggregation, gitInitWorkflowAggregation, gitPullAggregation, pnpmInstallAndBuildAggregation, pnpmInstallAggregation, forceCleanupAggregation, ensureDirAggregation, } from "./procedures/lib/aggregations/index.js";
/**
 * All aggregation definitions to register
 */
export const aggregationRegistry = [
    // ==========================================================================
    // Aggregation Primitives (reusable building blocks)
    // ==========================================================================
    {
        path: ["agg", "git", "commitAndPush"],
        aggregation: gitCommitAndPushAggregation,
        metadata: {
            description: "Git commit and push workflow",
            tags: ["git", "workflow", "primitive"],
        },
    },
    {
        path: ["agg", "git", "initWorkflow"],
        aggregation: gitInitWorkflowAggregation,
        metadata: {
            description: "Git init workflow for new packages",
            tags: ["git", "workflow", "primitive"],
        },
    },
    {
        path: ["agg", "git", "pull"],
        aggregation: gitPullAggregation,
        metadata: {
            description: "Git pull with optional rebase",
            tags: ["git", "workflow", "primitive"],
        },
    },
    {
        path: ["agg", "pnpm", "installAndBuild"],
        aggregation: pnpmInstallAndBuildAggregation,
        metadata: {
            description: "PNPM install and build workflow",
            tags: ["pnpm", "workflow", "primitive"],
        },
    },
    {
        path: ["agg", "pnpm", "install"],
        aggregation: pnpmInstallAggregation,
        metadata: {
            description: "PNPM install only",
            tags: ["pnpm", "workflow", "primitive"],
        },
    },
    {
        path: ["agg", "cleanup", "force"],
        aggregation: forceCleanupAggregation,
        metadata: {
            description: "Force cleanup (remove node_modules, dist, etc.)",
            tags: ["cleanup", "primitive"],
        },
    },
    {
        path: ["agg", "fs", "ensureDir"],
        aggregation: ensureDirAggregation,
        metadata: {
            description: "Ensure directory exists (mkdir -p)",
            tags: ["fs", "primitive"],
        },
    },
    // ==========================================================================
    // lib.new Aggregations
    // ==========================================================================
    {
        path: ["agg", "lib", "new"],
        aggregation: libNewAggregation,
        metadata: {
            description: "Create a new package (aggregation version)",
            tags: ["lib", "new", "package"],
        },
    },
    {
        path: ["agg", "lib", "scaffold"],
        aggregation: libScaffoldAggregation,
        metadata: {
            description: "Scaffold directory structure only",
            tags: ["lib", "scaffold"],
        },
    },
    // ==========================================================================
    // lib.refresh Aggregations
    // ==========================================================================
    {
        path: ["agg", "lib", "refresh", "single"],
        aggregation: refreshSinglePackageAggregation,
        metadata: {
            description: "Refresh a single package",
            tags: ["lib", "refresh"],
        },
    },
    {
        path: ["agg", "lib", "refresh"],
        aggregation: libRefreshAggregation,
        metadata: {
            description: "Refresh packages (aggregation version)",
            tags: ["lib", "refresh"],
        },
    },
    // ==========================================================================
    // lib.install Aggregations
    // ==========================================================================
    {
        path: ["agg", "lib", "install", "cloneMissing"],
        aggregation: cloneMissingPackageAggregation,
        metadata: {
            description: "Clone missing package if needed",
            tags: ["lib", "install", "clone"],
        },
    },
    {
        path: ["agg", "lib", "install", "single"],
        aggregation: installSinglePackageAggregation,
        metadata: {
            description: "Install a single package",
            tags: ["lib", "install"],
        },
    },
    {
        path: ["agg", "lib", "install"],
        aggregation: libInstallAggregation,
        metadata: {
            description: "Install ecosystem packages (aggregation version)",
            tags: ["lib", "install"],
        },
    },
    // ==========================================================================
    // lib.pull Aggregations
    // ==========================================================================
    {
        path: ["agg", "lib", "pull", "single"],
        aggregation: pullSinglePackageAggregation,
        metadata: {
            description: "Pull a single package",
            tags: ["lib", "pull"],
        },
    },
    {
        path: ["agg", "lib", "pull"],
        aggregation: libPullAggregation,
        metadata: {
            description: "Pull all packages (aggregation version)",
            tags: ["lib", "pull"],
        },
    },
];
/**
 * Register all aggregation-based procedures via procedure.define
 *
 * @param client - Client with procedure.define available
 * @param options - Registration options
 * @returns Registration results
 */
export async function registerAggregationProcedures(client, options = {}) {
    const { replace = false, filter, verbose = false } = options;
    const registered = [];
    const skipped = [];
    const errors = [];
    for (const entry of aggregationRegistry) {
        const pathStr = entry.path.join(".");
        // Apply filter if provided
        if (filter && !filter(entry.path)) {
            skipped.push(pathStr);
            continue;
        }
        try {
            if (verbose) {
                console.log(`Registering aggregation: ${pathStr}`);
            }
            await client.call(["procedure", "define"], {
                path: entry.path,
                aggregation: entry.aggregation,
                replace,
                metadata: entry.metadata,
            });
            registered.push(pathStr);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({ path: pathStr, error: errorMessage });
        }
    }
    return { registered, skipped, errors };
}
/**
 * Get all aggregation definitions (for inspection/testing)
 */
export function getAllAggregations() {
    return [...aggregationRegistry];
}
/**
 * Get aggregation by path
 */
export function getAggregation(path) {
    const pathStr = path.join(".");
    return aggregationRegistry.find((r) => r.path.join(".") === pathStr);
}
/**
 * List all registered aggregation paths
 */
export function listAggregationPaths() {
    return aggregationRegistry.map((r) => r.path.join("."));
}
//# sourceMappingURL=register-aggregations.js.map