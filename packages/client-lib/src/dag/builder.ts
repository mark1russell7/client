/**
 * DAG Builder
 *
 * Builds the ecosystem-specific dependency DAG from package scan results. This is the only
 * domain-specific piece; the generic DAG algorithms (buildLeveledDAG, executeDAG, filterDAGFromRoot,
 * getAncestors, getDescendants, ...) live in @mark1russell7/client-dag. This package previously
 * vendored a verbatim copy of those — see documentation/BUGS-2026-07.md (DAG de-dup).
 */

import type { DAGNode, PackageInfo } from "../types.js";

/**
 * Build DAG nodes from package info.
 *
 * Creates nodes only for packages that are mark1russell7 dependencies and exist in the scanned
 * packages. `id` mirrors `name` so the nodes satisfy client-dag's DAGNode contract (which keys by
 * id) while the ecosystem code keeps using the readable `name`.
 */
export function buildDAGNodes(
  packages: Record<string, PackageInfo>
): Map<string, DAGNode> {
  const nodes = new Map<string, DAGNode>();

  for (const [name, info] of Object.entries(packages)) {
    // Only include packages that have mark1russell7 dependencies or are dependencies of others.
    const deps = info.mark1russell7Deps.filter((dep) => packages[dep] !== undefined);

    const gitRef = info.gitRemote ?? `github:mark1russell7/${info.name}#${info.currentBranch ?? "main"}`;
    const requiredBranch = info.currentBranch ?? "main";

    const node: DAGNode = {
      id: name,
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
