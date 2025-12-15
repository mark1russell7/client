/**
 * DAG Traversal using Kahn's Algorithm
 *
 * Implements topological sort with level assignment for parallel execution.
 * Level 0 = leaves (no dependencies), higher levels depend on lower levels.
 */
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
export function buildLeveledDAG(nodes) {
    // Step 1: Compute in-degrees (number of dependencies each node has within the DAG)
    const inDegree = new Map();
    const dependents = new Map(); // reverse edges
    for (const [name, node] of nodes) {
        // Only count dependencies that are also in our DAG
        const depsInDag = node.dependencies.filter((dep) => nodes.has(dep));
        inDegree.set(name, depsInDag.length);
        dependents.set(name, new Set());
    }
    // Build reverse edges (who depends on whom)
    for (const [name, node] of nodes) {
        for (const dep of node.dependencies) {
            if (dependents.has(dep)) {
                dependents.get(dep).add(name);
            }
        }
    }
    // Step 2: Find leaves (in-degree 0 = no dependencies within DAG)
    let queue = [];
    for (const [name, degree] of inDegree) {
        if (degree === 0) {
            queue.push(name);
        }
    }
    // Step 3: Kahn's algorithm with level tracking
    const levels = [];
    const nodeLevel = new Map();
    let processedCount = 0;
    while (queue.length > 0) {
        // All nodes in current queue are at the same level
        const currentLevel = levels.length;
        const levelNodes = [];
        const nextQueue = [];
        for (const name of queue) {
            const node = nodes.get(name);
            node.level = currentLevel;
            nodeLevel.set(name, currentLevel);
            levelNodes.push(node);
            processedCount++;
            // Decrement in-degree of dependents
            for (const dependent of dependents.get(name) ?? []) {
                const newDegree = inDegree.get(dependent) - 1;
                inDegree.set(dependent, newDegree);
                if (newDegree === 0) {
                    nextQueue.push(dependent);
                }
            }
        }
        levels.push(levelNodes);
        queue = nextQueue;
    }
    // Cycle detection
    if (processedCount !== nodes.size) {
        const cycleNodes = [...nodes.keys()].filter((n) => !nodeLevel.has(n));
        throw new Error(`Circular dependency detected involving: ${cycleNodes.join(", ")}`);
    }
    // Find roots (no dependents in DAG) and leaves (no dependencies)
    const roots = [...nodes.keys()].filter((name) => {
        const deps = dependents.get(name);
        return !deps || deps.size === 0;
    });
    const leaves = [...nodes.keys()].filter((name) => {
        const node = nodes.get(name);
        const depsInDag = node.dependencies.filter((dep) => nodes.has(dep));
        return depsInDag.length === 0;
    });
    return { nodes, levels, roots, leaves };
}
/**
 * Get the topological order (flat list, leaves first)
 */
export function getTopologicalOrder(dag) {
    return dag.levels.flat();
}
/**
 * Visualize the DAG structure (for debugging)
 */
export function visualizeDAG(dag) {
    const lines = ["DAG Structure:"];
    for (let i = 0; i < dag.levels.length; i++) {
        const level = dag.levels[i];
        lines.push(`  Level ${i}:`);
        for (const node of level) {
            const deps = node.dependencies.length > 0
                ? ` -> [${node.dependencies.join(", ")}]`
                : " (leaf)";
            lines.push(`    - ${node.name}${deps}`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=traversal.js.map