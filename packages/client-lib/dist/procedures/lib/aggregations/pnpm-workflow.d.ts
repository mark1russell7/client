/**
 * PNPM Workflow Aggregations
 *
 * Reusable pnpm patterns as aggregation definitions.
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * PNPM install and build workflow
 *
 * Pattern: pnpm install → pnpm run build
 * Used by: lib.refresh, lib.install
 */
export declare const pnpmInstallAndBuildAggregation: AggregationDefinition;
/**
 * PNPM install only
 *
 * Pattern: pnpm install with options
 * Used by: various procedures needing just install
 */
export declare const pnpmInstallAggregation: AggregationDefinition;
//# sourceMappingURL=pnpm-workflow.d.ts.map