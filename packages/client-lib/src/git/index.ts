/**
 * Git utilities
 */

export {
  getCurrentBranch,
  getGitStatus,
  getRemoteUrl,
  stageAll,
  commit,
  push,
  checkout,
  pull,
  branchExists,
  clone,
  ensureBranch,
} from "./operations.js";

export {
  parseGitRef,
  isGitRef,
  isMark1Russell7Ref,
  extractMark1Russell7Deps,
  getPackageNameFromRef,
} from "./ref-parser.js";
