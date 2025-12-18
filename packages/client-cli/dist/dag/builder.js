/**
 * DAG Builder
 *
 * Builds a dependency DAG from package scan results.
 */
/**
 * Build DAG nodes from package info
 *
 * Creates nodes only for packages that are mark1russell7 dependencies
 * and exist in the scanned packages.
 */
export function buildDAGNodes(packages) {
    const nodes = new Map();
    for (const [name, info] of Object.entries(packages)) {
        // Only include packages that have mark1russell7 dependencies
        // or are dependencies of other packages
        const deps = info.mark1russell7Deps.filter((dep) => packages[dep] !== undefined);
        // Use the current branch from scan results, or fall back to main
        const gitRef = info.gitRemote ?? `github:mark1russell7/${info.name}#${info.currentBranch ?? "main"}`;
        const requiredBranch = info.currentBranch ?? "main";
        const node = {
            name,
            repoPath: info.repoPath,
            gitRef,
            requiredBranch,
            dependencies: deps,
        };
        nodes.set(name, node);
    }
    return nodes;
}
/**
 * Filter DAG to only include nodes reachable from a root
 */
export function filterDAGFromRoot(nodes, rootName) {
    const filtered = new Map();
    const visited = new Set();
    function visit(name) {
        if (visited.has(name))
            return;
        visited.add(name);
        const node = nodes.get(name);
        if (!node)
            return;
        filtered.set(name, node);
        for (const dep of node.dependencies) {
            visit(dep);
        }
    }
    visit(rootName);
    return filtered;
}
/**
 * Get all ancestors of a node (nodes that this node depends on, transitively)
 */
export function getAncestors(nodes, name) {
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
    visit(name);
    return ancestors;
}
/**
 * Get all descendants of a node (nodes that depend on this node, transitively)
 */
export function getDescendants(nodes, name) {
    const descendants = new Set();
    const visited = new Set();
    // Build reverse dependency map
    const dependents = new Map();
    for (const [nodeName, node] of nodes) {
        for (const dep of node.dependencies) {
            if (!dependents.has(dep)) {
                dependents.set(dep, new Set());
            }
            dependents.get(dep).add(nodeName);
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
    visit(name);
    return descendants;
}
//# sourceMappingURL=builder.js.map