/**
 * @mark1russell7/client-lib
 *
 * Library management procedures for the workspace - scan, new, audit, rename.
 */

// Importing the package registers its procedures, as in the other client packages (BUGS-2026-07 H18)
import "./register.js";

// Re-export types
export * from "./types.js";

// Re-export procedures
export {
  libScan,
  libRename,
  libNew,
  libAudit,
} from "./procedures/lib/index.js";

// Re-export ecosystem procedures
export {
  ecosystemProcedures,
  EcosystemProceduresInputSchema,
} from "./procedures/ecosystem/index.js";
export type {
  EcosystemProceduresInput,
  EcosystemProceduresOutput,
  ProcedureInfo,
  PackageProcedures,
} from "./procedures/ecosystem/index.js";

// Re-export DAG utilities (ecosystem-specific)
export {
  buildDAGNodes,
  filterDAGFromRoot,
  getAncestors,
  getDescendants,
  buildLeveledDAG,
  getTopologicalOrder,
  visualizeDAG,
  executeDAG,
  executeDAGSequential,
  createProcessor,
} from "./dag/index.js";

// Re-export git utilities
export {
  parseGitRef,
  isGitRef,
  isMark1Russell7Ref,
  extractMark1Russell7Deps,
  getPackageNameFromRef,
} from "./git/index.js";

// The global flags of the mark CLI (also at "@mark1russell7/client-lib/cli-flags", with no side effects)
export { CLI_GLOBAL_FLAGS, findGlobalFlag, type CliGlobalFlag } from "./cli-flags.js";
