/**
 * Generic DAG Types
 *
 * These types are designed to be reusable across different use cases.
 * For ecosystem-specific DAG building, see client-lib.
 */

/**
 * A node in a dependency DAG
 */
export interface DAGNode<TData = unknown> {
  /** Unique identifier for this node */
  id: string;
  /** Names/IDs of nodes this node depends on */
  dependencies: string[];
  /** Topological level (0 = leaves, computed by Kahn's algorithm) */
  level?: number;
  /** Optional user data associated with this node */
  data?: TData | undefined;
}

/**
 * A dependency DAG with level information for parallel execution
 */
export interface DependencyDAG<TNode extends DAGNode = DAGNode> {
  /** All nodes in the DAG */
  nodes: Map<string, TNode>;
  /** Nodes grouped by level for parallel execution */
  levels: TNode[][];
  /** Root nodes (no dependents in the DAG) */
  roots: string[];
  /** Leaf nodes (no dependencies in the DAG) */
  leaves: string[];
}

/**
 * Options for DAG execution
 */
export interface DAGExecutionOptions<TNode extends DAGNode = DAGNode> {
  /** Max parallel operations per level (default: 4) */
  concurrency?: number;
  /** Stop on first error vs continue (default: true) */
  failFast?: boolean;
  /** Callback for progress reporting */
  onNodeStart?: (node: TNode) => void;
  /** Callback when a node completes */
  onNodeComplete?: (result: NodeResult<TNode>) => void;
}

/**
 * Result of processing a single node
 */
export interface NodeResult<TNode extends DAGNode = DAGNode> {
  /** The node that was processed */
  node: TNode;
  /** Whether processing succeeded */
  success: boolean;
  /** Error if failed */
  error?: Error | undefined;
  /** Duration in milliseconds */
  duration: number;
  /** Logs from processing */
  logs: string[];
  /** Optional output from the processor */
  output?: unknown | undefined;
}

/**
 * Result of executing an entire DAG
 */
export interface DAGResult<TNode extends DAGNode = DAGNode> {
  /** Overall success */
  success: boolean;
  /** Results for each node */
  results: Map<string, NodeResult<TNode>>;
  /** Names of failed nodes */
  failedNodes: string[];
  /** Total duration in milliseconds */
  totalDuration: number;
}

/**
 * Processor function type
 */
export type NodeProcessor<TNode extends DAGNode = DAGNode> = (
  node: TNode
) => Promise<NodeResult<TNode>>;
