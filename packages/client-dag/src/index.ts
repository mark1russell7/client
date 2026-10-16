/**
 * @procedures/dag
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
 * } from "@procedures/dag";
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

// Types
export type {
  DAGNode,
  DependencyDAG,
  DAGExecutionOptions,
  NodeResult,
  DAGResult,
  NodeProcessor,
} from "./types.js";

// DAG utilities
export {
  buildLeveledDAG,
  getTopologicalOrder,
  visualizeDAG,
  executeDAG,
  executeDAGSequential,
  createProcessor,
  filterDAGFromRoot,
  getAncestors,
  getDescendants,
  createNode,
  buildNodeMap,
} from "./dag/index.js";

// The procedure dag.traverse. The root registers nothing: import "@procedures/dag/register", or
// give the module to createRegistry() with the module of @procedures/lib.
export * from "./module.js";
export {
  DagTraverseInputSchema,
  DagTraverseOutputSchema,
  type DagTraverseInput,
  type DagTraverseOutput,
  type TraverseNodeResult,
  type ScannedPackage,
  type ScanOutput,
  type PackageNode,
} from "./procedures/types.js";
export { dagTraverse, packageNodes, callsGit, keyedLock, repositoryRoot } from "./procedures/traverse.js";
