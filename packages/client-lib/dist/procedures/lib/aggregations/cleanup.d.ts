/**
 * Cleanup Aggregations
 *
 * File/directory cleanup patterns as aggregation definitions.
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Force cleanup for package refresh
 *
 * Pattern: Remove node_modules, dist, pnpm-lock.yaml, tsconfig.tsbuildinfo
 * Used by: lib.refresh --force
 */
export declare const forceCleanupAggregation: AggregationDefinition;
/**
 * Ensure directory exists (mkdir -p equivalent)
 *
 * Pattern: Check exists → mkdir if not
 * Used by: lib.new, various scaffold procedures
 */
export declare const ensureDirAggregation: AggregationDefinition;
//# sourceMappingURL=cleanup.d.ts.map