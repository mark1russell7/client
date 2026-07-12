/**
 * DAG Executor with parallel level-based execution
 */
/**
 * Execute a batch of items with concurrency limit
 */
async function executeWithConcurrency(items, fn, limit) {
    const results = [];
    const executing = new Set();
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
export async function executeDAG(dag, processor, options = {}) {
    const { concurrency = 4, failFast = true, onNodeStart, onNodeComplete, } = options;
    const results = new Map();
    const failedNodes = [];
    const startTime = Date.now();
    let shouldStop = false;
    for (const level of dag.levels) {
        if (shouldStop)
            break;
        const levelResults = await executeWithConcurrency(level, async (node) => {
            onNodeStart?.(node);
            const nodeStart = Date.now();
            let result;
            try {
                result = await processor(node);
            }
            catch (error) {
                // Convert a thrown processor error into a failed NodeResult instead
                // of rejecting the entire run and discarding partial results.
                const err = error instanceof Error ? error : new Error(String(error));
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
        }, concurrency);
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
export async function executeDAGSequential(dag, processor, options = {}) {
    return executeDAG(dag, processor, { ...options, concurrency: 1 });
}
/**
 * Create a simple processor that wraps an async function
 */
export function createProcessor(fn) {
    return async (node) => {
        const startTime = Date.now();
        const logs = [];
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
        }
        catch (error) {
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
//# sourceMappingURL=executor.js.map