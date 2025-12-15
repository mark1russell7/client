/**
 * client-cli
 *
 * CLI operations as RPC procedures.
 * Enables lib.scan and lib.refresh via client.call().
 *
 * @example
 * ```typescript
 * import { Client } from "client";
 *
 * const client = new Client(...);
 *
 * // Scan for packages
 * const { packages, warnings } = await client.call(["lib", "scan"], {});
 * console.log(Object.keys(packages));
 *
 * // Refresh a single package
 * await client.call(["lib", "refresh"], { path: "./my-package" });
 *
 * // Recursive refresh (bottom-up DAG)
 * await client.call(["lib", "refresh"], {
 *   path: "./my-package",
 *   recursive: true,
 *   autoConfirm: true, // non-interactive
 * });
 * ```
 */
export type { LibScanInput, LibScanOutput, PackageInfo, LibRefreshInput, LibRefreshOutput, RefreshResult, DAGNode, DependencyDAG, DAGExecutionOptions, NodeResult, DAGResult, GitRef, GitStatus, } from "./types.js";
export { LibScanInputSchema, LibRefreshInputSchema } from "./types.js";
export { libScan, libRefresh } from "./procedures/lib/index.js";
export { buildLeveledDAG, getTopologicalOrder, visualizeDAG, executeDAG, executeDAGSequential, createProcessor, buildDAGNodes, filterDAGFromRoot, getAncestors, getDescendants, } from "./dag/index.js";
export { parseGitRef, isGitRef, isMark1Russell7Ref, extractMark1Russell7Deps, getPackageNameFromRef, getCurrentBranch, getGitStatus, getRemoteUrl, stageAll, commit, push, checkout, pull, branchExists, ensureBranch, } from "./git/index.js";
export { executeCommand, npmInstall, npmBuild, removeDir, removeFile, } from "./shell/index.js";
export type { ShellResult, ShellOptions } from "./shell/index.js";
export { registerCliProcedures } from "./register.js";
//# sourceMappingURL=index.d.ts.map