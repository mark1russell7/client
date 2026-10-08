/**
 * DAG Builder utilities
 */
/**
 * Filter DAG to only include nodes reachable from a root
 */
export function filterDAGFromRoot(nodes, rootId) {
    const filtered = new Map();
    const visited = new Set();
    function visit(id) {
        if (visited.has(id))
            return;
        visited.add(id);
        const node = nodes.get(id);
        if (!node)
            return;
        filtered.set(id, node);
        for (const dep of node.dependencies) {
            visit(dep);
        }
    }
    visit(rootId);
    return filtered;
}
/**
 * Get all ancestors of a node (nodes that this node depends on, transitively)
 */
export function getAncestors(nodes, id) {
    const ancestors = new Set();
    const visited = new Set();
    function visit(n) {
        if (visited.has(n))
            return;
        visited.add(n);
        const node = nodes.get(n);
        if (!node)
            return;
        for (const dep of node.dependencies) {
            if (nodes.has(dep)) {
                ancestors.add(dep);
                visit(dep);
            }
        }
    }
    visit(id);
    return ancestors;
}
/**
 * Get all descendants of a node (nodes that depend on this node, transitively)
 */
export function getDescendants(nodes, id) {
    const descendants = new Set();
    const visited = new Set();
    // Build reverse dependency map
    const dependents = new Map();
    for (const [nodeId, node] of nodes) {
        for (const dep of node.dependencies) {
            if (!dependents.has(dep)) {
                dependents.set(dep, new Set());
            }
            dependents.get(dep).add(nodeId);
        }
    }
    function visit(n) {
        if (visited.has(n))
            return;
        visited.add(n);
        const deps = dependents.get(n);
        if (!deps)
            return;
        for (const dep of deps) {
            descendants.add(dep);
            visit(dep);
        }
    }
    visit(id);
    return descendants;
}
/**
 * Create a DAG node from minimal input
 */
export function createNode(id, dependencies = [], data) {
    const node = { id, dependencies };
    if (data !== undefined) {
        node.data = data;
    }
    return node;
}
/**
 * Build a Map of nodes from an array
 */
export function buildNodeMap(nodes) {
    return new Map(nodes.map((n) => [n.id, n]));
}
//# sourceMappingURL=builder.js.map