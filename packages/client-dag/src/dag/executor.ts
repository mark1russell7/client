/**
 * DAG Executor with parallel level-based execution
 */

import type {
  DependencyDAG,
  DAGNode,
  DAGExecutionOptions,
  NodeResult,
  DAGResult,
} from "../types.js";

/**
 * Execute a batch of items with concurrency limit
 */
async function executeWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = fn(item).then((result) => {
      results.push(result);
      executing.delete(promise);
    });

    executing.add(promise);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Execute DAG with level-based parallelization
 *
 * - Levels are processed sequentially (level 0 first, then 1, etc.)
 * - Within each level, nodes are processed in parallel up to concurrency limit
 * - Supports fail-fast or continue-on-error modes
 */
export async function executeDAG<TNode extends DAGNode>(
  dag: DependencyDAG<TNode>,
  processor: (node: TNode) => Promise<NodeResult<TNode>>,
  options: DAGExecutionOptions<TNode> = {}
): Promise<DAGResult<TNode>> {
  const {
    concurrency = 4,
    failFast = true,
    onNodeStart,
    onNodeComplete,
  } = options;

  const results = new Map<string, NodeResult<TNode>>();
  const failedNodes: string[] = [];
  const startTime = Date.now();
  let shouldStop = false;

  for (const level of dag.levels) {
    if (shouldStop) break;

    const levelResults = await executeWithConcurrency(
      level,
      async (node) => {
        if (shouldStop) {
          return {
            node,
            success: false,
            error: new Error("Skipped due to earlier failure"),
            duration: 0,
            logs: ["Skipped due to earlier failure"],
          };
        }

        onNodeStart?.(node);
        const result = await processor(node);
        onNodeComplete?.(result);
        return result;
      },
      concurrency
    );

    for (const result of levelResults) {
      results.set(result.node.id, result);
      if (!result.success) {
        failedNodes.push(result.node.id);
        if (failFast) {
          shouldStop = true;
        }
      }
    }
  }

  return {
    success: failedNodes.length === 0,
    results,
    failedNodes,
    totalDuration: Date.now() - startTime,
  };
}

/**
 * Execute DAG sequentially (no parallelization)
 */
export async function executeDAGSequential<TNode extends DAGNode>(
  dag: DependencyDAG<TNode>,
  processor: (node: TNode) => Promise<NodeResult<TNode>>,
  options: Omit<DAGExecutionOptions<TNode>, "concurrency"> = {}
): Promise<DAGResult<TNode>> {
  return executeDAG(dag, processor, { ...options, concurrency: 1 });
}

/**
 * Create a simple processor that wraps an async function
 */
export function createProcessor<TNode extends DAGNode>(
  fn: (node: TNode) => Promise<void>
): (node: TNode) => Promise<NodeResult<TNode>> {
  return async (node: TNode): Promise<NodeResult<TNode>> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      logs.push("Starting " + node.id);
      await fn(node);
      logs.push("Completed " + node.id);

      return {
        node,
        success: true,
        duration: Date.now() - startTime,
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logs.push("Failed " + node.id + ": " + err.message);

      return {
        node,
        success: false,
        error: err,
        duration: Date.now() - startTime,
        logs,
      };
    }
  };
}
