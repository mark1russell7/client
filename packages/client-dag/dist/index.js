/**
 * @mark1russell7/client-dag
 *
 * Generic DAG (Directed Acyclic Graph) algorithms for dependency management.
 *
 * Features:
 * - Kahn's algorithm for topological sorting with level assignment
 * - Parallel execution with concurrency control
 * - Cycle detection
 * - Graph filtering and traversal utilities
 *
 * @example
 * ```typescript
 * import {
 *   createNode,
 *   buildNodeMap,
 *   buildLeveledDAG,
 *   executeDAG,
 *   createProcessor
 * } from "@mark1russell7/client-dag";
 *
 * // Create nodes
 * const nodes = buildNodeMap([
 *   createNode("a", []),
 *   createNode("b", ["a"]),
 *   createNode("c", ["a", "b"]),
 * ]);
 *
 * // Build leveled DAG
 * const dag = buildLeveledDAG(nodes);
 *
 * // Execute in dependency order
 * const processor = createProcessor(async (node) => {
 *   console.log(`Processing ${node.id}`);
 * });
 *
 * const result = await executeDAG(dag, processor, { concurrency: 2 });
 * ```
 */
// DAG utilities
export { buildLeveledDAG, getTopologicalOrder, visualizeDAG, executeDAG, executeDAGSequential, createProcessor, filterDAGFromRoot, getAncestors, getDescendants, createNode, buildNodeMap, } from "./dag/index.js";
//# sourceMappingURL=index.js.map