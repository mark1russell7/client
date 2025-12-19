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
export function buildDAGNodes(
  packages: Record<string, PackageInfo>
): Map<string, DAGNode> {
  const nodes = new Map<string, DAGNode>();

  for (const [name, info] of Object.entries(packages)) {
    // Only include packages that have mark1russell7 dependencies
    // or are dependencies of other packages
    const deps = info.mark1russell7Deps.filter((dep) => packages[dep] !== undefined);

    // Use the current branch from scan results, or fall back to main
    const gitRef = info.gitRemote ?? `github:mark1russell7/${info.name}#${info.currentBranch ?? "main"}`;
    const requiredBranch = info.currentBranch ?? "main";

    const node: DAGNode = {
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
export function filterDAGFromRoot(
  nodes: Map<string, DAGNode>,
  rootName: string
): Map<string, DAGNode> {
  const filtered = new Map<string, DAGNode>();
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const node = nodes.get(name);
    if (!node) return;

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
export function getAncestors(
  nodes: Map<string, DAGNode>,
  name: string
): Set<string> {
  const ancestors = new Set<string>();
  const visited = new Set<string>();

  function visit(n: string): void {
    if (visited.has(n)) return;
    visited.add(n);

    const node = nodes.get(n);
    if (!node) return;

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
export function getDescendants(
  nodes: Map<string, DAGNode>,
  name: string
): Set<string> {
  const descendants = new Set<string>();
  const visited = new Set<string>();

  // Build reverse dependency map
  const dependents = new Map<string, Set<string>>();
  for (const [nodeName, node] of nodes) {
    for (const dep of node.dependencies) {
      if (!dependents.has(dep)) {
        dependents.set(dep, new Set());
      }
      dependents.get(dep)!.add(nodeName);
    }
  }

  function visit(n: string): void {
    if (visited.has(n)) return;
    visited.add(n);

    const deps = dependents.get(n);
    if (!deps) return;

    for (const dep of deps) {
      descendants.add(dep);
      visit(dep);
    }
  }

  visit(name);
  return descendants;
}
