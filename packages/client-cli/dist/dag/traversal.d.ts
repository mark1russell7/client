/**
 * DAG Traversal using Kahn's Algorithm
 *
 * Implements topological sort with level assignment for parallel execution.
 * Level 0 = leaves (no dependencies), higher levels depend on lower levels.
 */
import type { DAGNode, DependencyDAG } from "../types.js";
/**
 * Build a leveled DAG from nodes using Kahn's algorithm
 *
 * This assigns levels to each node where:
 * - Level 0: Nodes with no dependencies (leaves)
 * - Level N: Nodes whose dependencies are all at level < N
 *
 * Nodes at the same level can be processed in parallel.
 *
 * @throws Error if a cycle is detected
 */
export declare function buildLeveledDAG(nodes: Map<string, DAGNode>): DependencyDAG;
/**
 * Get the topological order (flat list, leaves first)
 */
export declare function getTopologicalOrder(dag: DependencyDAG): DAGNode[];
/**
 * Visualize the DAG structure (for debugging)
 */
export declare function visualizeDAG(dag: DependencyDAG): string;
//# sourceMappingURL=traversal.d.ts.map