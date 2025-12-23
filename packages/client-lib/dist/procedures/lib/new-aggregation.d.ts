/**
 * lib.new as an Aggregation Definition
 *
 * This file demonstrates converting lib.new from imperative code to a declarative
 * aggregation using the procedure.define meta-procedure pattern.
 *
 * The aggregation approach:
 * 1. Define steps as procedure references ($proc)
 * 2. Use $ref to reference input and previous results
 * 3. Use $when to control conditional execution
 * 4. Use $name to capture outputs for later reference
 *
 * Benefits:
 * - Declarative, composable, and serializable
 * - Can be stored, loaded, and modified at runtime
 * - Automatic parallelization where possible
 * - Clear dependency graph
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Aggregation definition for lib.new
 *
 * This demonstrates how the 250-line imperative lib.new could be expressed
 * as a ~60 line declarative aggregation.
 */
export declare const libNewAggregation: AggregationDefinition;
/**
 * Helper aggregation: lib.scaffold
 *
 * Creates just the directory structure without git or manifest.
 * Demonstrates a simpler aggregation that can be composed with lib.new.
 */
export declare const libScaffoldAggregation: AggregationDefinition;
/**
 * Git workflow aggregation
 *
 * Reusable aggregation for git init + add + commit + push pattern.
 * Can be composed with other aggregations.
 */
export declare const gitInitWorkflowAggregation: AggregationDefinition;
//# sourceMappingURL=new-aggregation.d.ts.map