/**
 * DAG Builder utilities
 */
import type { DAGNode } from "../types.js";
/**
 * Filter DAG to only include nodes reachable from a root
 */
export declare function filterDAGFromRoot<TNode extends DAGNode>(nodes: Map<string, TNode>, rootId: string): Map<string, TNode>;
/**
 * Get all ancestors of a node (nodes that this node depends on, transitively)
 */
export declare function getAncestors<TNode extends DAGNode>(nodes: Map<string, TNode>, id: string): Set<string>;
/**
 * Get all descendants of a node (nodes that depend on this node, transitively)
 */
export declare function getDescendants<TNode extends DAGNode>(nodes: Map<string, TNode>, id: string): Set<string>;
/**
 * Create a DAG node from minimal input
 */
export declare function createNode<TData = unknown>(id: string, dependencies?: string[], data?: TData | undefined): DAGNode<TData>;
/**
 * Build a Map of nodes from an array
 */
export declare function buildNodeMap<TNode extends DAGNode>(nodes: TNode[]): Map<string, TNode>;
//# sourceMappingURL=builder.d.ts.map