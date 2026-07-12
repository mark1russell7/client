/**
 * DAG utilities.
 *
 * The generic DAG algorithms are re-exported from @mark1russell7/client-dag; only buildDAGNodes
 * (which builds the ecosystem package graph) is domain-specific and stays local. This package
 * previously vendored a verbatim copy of the generic algorithms — deduplicated here. The nodes
 * carry an `id` (mirroring `name`) so they satisfy client-dag's generic `DAGNode` contract.
 * See documentation/BUGS-2026-07.md (DAG de-dup / H27).
 */
export { buildLeveledDAG, getTopologicalOrder, visualizeDAG, executeDAG, executeDAGSequential, createProcessor, filterDAGFromRoot, getAncestors, getDescendants, } from "@mark1russell7/client-dag";
export { buildDAGNodes } from "./builder.js";
//# sourceMappingURL=index.d.ts.map