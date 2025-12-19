/**
 * @mark1russell7/client-lib
 *
 * Library management procedures - scan, refresh, install, pull, etc.
 */
// Re-export types
export * from "./types.js";
// Re-export procedures
export { libScan, libRefresh, libRename, libInstall, libNew, libAudit, libPull, } from "./procedures/lib/index.js";
// Re-export DAG utilities (ecosystem-specific)
export { buildDAGNodes, filterDAGFromRoot, getAncestors, getDescendants, buildLeveledDAG, getTopologicalOrder, visualizeDAG, executeDAG, executeDAGSequential, createProcessor, } from "./dag/index.js";
// Re-export git utilities
export { getCurrentBranch, getGitStatus, getRemoteUrl, stageAll, commit, push, checkout, pull, branchExists, clone, ensureBranch, parseGitRef, isGitRef, isMark1Russell7Ref, extractMark1Russell7Deps, getPackageNameFromRef, } from "./git/index.js";
// Re-export shell utilities
export { executeCommand, pnpmInstall, pnpmBuild, removeDir, removeFile, } from "./shell/index.js";
//# sourceMappingURL=index.js.map