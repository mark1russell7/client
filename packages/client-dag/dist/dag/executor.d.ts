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
export declare function executeDAG<TNode extends DAGNode>(dag: DependencyDAG<TNode>, processor: (node: TNode) => Promise<NodeResult<TNode>>, options?: DAGExecutionOptions<TNode>): Promise<DAGResult<TNode>>;
/**
 * Execute DAG sequentially (no parallelization)
 */
export declare function executeDAGSequential<TNode extends DAGNode>(dag: DependencyDAG<TNode>, processor: (node: TNode) => Promise<NodeResult<TNode>>, options?: Omit<DAGExecutionOptions<TNode>, "concurrency">): Promise<DAGResult<TNode>>;
/**
 * Create a simple processor that wraps an async function
 */
export declare function createProcessor<TNode extends DAGNode>(fn: (node: TNode) => Promise<void>): (node: TNode) => Promise<NodeResult<TNode>>;
//# sourceMappingURL=executor.d.ts.map