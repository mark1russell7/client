/**
 * Git utilities
 */

export {
  parseGitRef,
  isGitRef,
  isMark1Russell7Ref,
  extractMark1Russell7Deps,
  getPackageNameFromRef,
} from "./ref-parser.js";

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
  ensureBranch,
  clone,
} from "./operations.js";
