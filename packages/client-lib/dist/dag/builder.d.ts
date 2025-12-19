/**
 * DAG Builder
 *
 * Builds a dependency DAG from package scan results.
 */
import type { DAGNode, PackageInfo } from "../types.js";
/**
 * Build DAG nodes from package info
 *
 * Creates nodes only for packages that are mark1russell7 dependencies
 * and exist in the scanned packages.
 */
export declare function buildDAGNodes(packages: Record<string, PackageInfo>): Map<string, DAGNode>;
/**
 * Filter DAG to only include nodes reachable from a root
 */
export declare function filterDAGFromRoot(nodes: Map<string, DAGNode>, rootName: string): Map<string, DAGNode>;
/**
 * Get all ancestors of a node (nodes that this node depends on, transitively)
 */
export declare function getAncestors(nodes: Map<string, DAGNode>, name: string): Set<string>;
/**
 * Get all descendants of a node (nodes that depend on this node, transitively)
 */
export declare function getDescendants(nodes: Map<string, DAGNode>, name: string): Set<string>;
//# sourceMappingURL=builder.d.ts.map