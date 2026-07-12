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
    const promise = fn(item)
      .then((result) => {
        results.push(result);
      })
      .finally(() => {
        // Rejection-safe cleanup: always remove the settled promise from the
        // executing set, even if `fn` rejected, so the set never leaks a
        // settled (possibly rejected) promise into later `race`/`all` waits.
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
 *
 * A processor that throws does NOT reject the whole run: the throw is captured
 * and recorded as a failed NodeResult, so partial results are always returned.
 *
 * `failFast` operates at level granularity. When a node in a level fails, every
 * node already in flight in that same level still runs to completion, but no
 * later level is started. (There is no mid-level cancellation.)
 */
export async function executeDAG(
  dag: DependencyDAG,
  processor: (node: DAGNode) => Promise<NodeResult>,
  options: DAGExecutionOptions = {}
): Promise<DAGResult> {
  const {
    concurrency = 4,
    failFast = true,
    onNodeStart,
    onNodeComplete,
  } = options;

  const results = new Map<string, NodeResult>();
  const failedNodes: string[] = [];
  const startTime = Date.now();
  let shouldStop = false;

  for (const level of dag.levels) {
    if (shouldStop) break;

    // Process level with concurrency limit
    const levelResults = await executeWithConcurrency(
      level,
      async (node) => {
        onNodeStart?.(node);
        const nodeStart = Date.now();
        let result: NodeResult;
        try {
          result = await processor(node);
        } catch (error) {
          // Convert a thrown processor error into a failed NodeResult instead
          // of rejecting the entire run and discarding partial results.
          const err =
            error instanceof Error ? error : new Error(String(error));
          result = {
            node,
            success: false,
            error: err,
            duration: Date.now() - nodeStart,
            logs: ["Processor threw: " + err.message],
          };
        }
        onNodeComplete?.(result);
        return result;
      },
      concurrency
    );

    // Collect results
    for (const result of levelResults) {
      results.set(result.node.name, result);
      if (!result.success) {
        failedNodes.push(result.node.name);
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
 * Useful for debugging or when order matters
 */
export async function executeDAGSequential(
  dag: DependencyDAG,
  processor: (node: DAGNode) => Promise<NodeResult>,
  options: Omit<DAGExecutionOptions, "concurrency"> = {}
): Promise<DAGResult> {
  return executeDAG(dag, processor, { ...options, concurrency: 1 });
}

/**
 * Create a simple processor that wraps an async function
 */
export function createProcessor(
  fn: (node: DAGNode) => Promise<void>
): (node: DAGNode) => Promise<NodeResult> {
  return async (node: DAGNode): Promise<NodeResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      logs.push(`Starting ${node.name}`);
      await fn(node);
      logs.push(`Completed ${node.name}`);

      return {
        node,
        success: true,
        duration: Date.now() - startTime,
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logs.push(`Failed ${node.name}: ${err.message}`);

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
