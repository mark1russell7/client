/**
 * lib.refresh as an Aggregation Definition
 *
 * This demonstrates converting the 427-line imperative lib.refresh
 * to a declarative aggregation using composition of reusable primitives.
 *
 * The aggregation approach:
 * 1. Compose reusable primitives (cleanup, pnpm workflow, git workflow)
 * 2. Use $when to control conditional execution
 * 3. DAG execution for recursive mode handled by dag.execute procedure
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Single package refresh aggregation
 *
 * Steps:
 * 1. (Conditional) Force cleanup: rm node_modules, dist, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm run build
 * 4. (Conditional) Git commit and push
 */
export declare const refreshSinglePackageAggregation: AggregationDefinition;
/**
 * Full lib.refresh aggregation
 *
 * Handles:
 * - Single package refresh
 * - --all flag for entire ecosystem
 * - --recursive flag for dependency tree
 * - --dry-run for planning
 */
export declare const libRefreshAggregation: AggregationDefinition;
//# sourceMappingURL=refresh-aggregation.d.ts.map