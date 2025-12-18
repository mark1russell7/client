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
export async function executeDAG(dag, processor, options = {}) {
    const { concurrency = 4, failFast = true, onNodeStart, onNodeComplete, } = options;
    const results = new Map();
    const failedNodes = [];
    const startTime = Date.now();
    let shouldStop = false;
    for (const level of dag.levels) {
        if (shouldStop)
            break;
        // Process level with concurrency limit
        const levelResults = await executeWithConcurrency(level, async (node) => {
            if (shouldStop) {
                // Return early result for skipped nodes
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
        }, concurrency);
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
            logs.push(`Starting ${node.name}`);
            await fn(node);
            logs.push(`Completed ${node.name}`);
            return {
                node,
                success: true,
                duration: Date.now() - startTime,
                logs,
            };
        }
        catch (error) {
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
//# sourceMappingURL=executor.js.map