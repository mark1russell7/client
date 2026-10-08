/**
 * Git Workflow Aggregations
 *
 * Reusable git patterns as aggregation definitions.
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Git commit and push workflow
 *
 * Pattern: stage all → commit → push
 * Used by: lib.refresh, lib.new
 */
export declare const gitCommitAndPushAggregation: AggregationDefinition;
/**
 * Git init workflow for new packages
 *
 * Pattern: init → add all → commit → create remote → push
 * Used by: lib.new
 */
export declare const gitInitWorkflowAggregation: AggregationDefinition;
/**
 * Git pull with optional rebase
 *
 * Pattern: pull (with rebase option)
 * Used by: lib.pull
 */
export declare const gitPullAggregation: AggregationDefinition;
//# sourceMappingURL=git-workflow.d.ts.map