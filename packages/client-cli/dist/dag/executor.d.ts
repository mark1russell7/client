/**
 * DAG Executor with parallel level-based execution
 */
import type { DependencyDAG, DAGNode, DAGExecutionOptions, NodeResult, DAGResult } from "../types.js";
/**
 * Execute DAG with level-based parallelization
 *
 * - Levels are processed sequentially (level 0 first, then 1, etc.)
 * - Within each level, nodes are processed in parallel up to concurrency limit
 * - Supports fail-fast or continue-on-error modes
 */
export declare function executeDAG(dag: DependencyDAG, processor: (node: DAGNode) => Promise<NodeResult>, options?: DAGExecutionOptions): Promise<DAGResult>;
/**
 * Execute DAG sequentially (no parallelization)
 * Useful for debugging or when order matters
 */
export declare function executeDAGSequential(dag: DependencyDAG, processor: (node: DAGNode) => Promise<NodeResult>, options?: Omit<DAGExecutionOptions, "concurrency">): Promise<DAGResult>;
/**
 * Create a simple processor that wraps an async function
 */
export declare function createProcessor(fn: (node: DAGNode) => Promise<void>): (node: DAGNode) => Promise<NodeResult>;
//# sourceMappingURL=executor.d.ts.map