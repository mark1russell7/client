/**
 * lib procedures
 */

export { libScan } from "./scan.js";
export { libRefresh } from "./refresh.js";
export { libRename } from "./rename.js";
export { libInstall } from "./install.js";
export { libNew } from "./new.js";
export { libAudit } from "./audit.js";
export { libPull } from "./pull.js";

// Aggregation definitions (declarative versions of the above)
export { libNewAggregation, libScaffoldAggregation, gitInitWorkflowAggregation } from "./new-aggregation.js";
export {
  refreshSinglePackageAggregation,
  libRefreshAggregation,
} from "./refresh-aggregation.js";
export {
  cloneMissingPackageAggregation,
  installSinglePackageAggregation,
  libInstallAggregation,
} from "./install-aggregation.js";
export {
  pullSinglePackageAggregation,
  libPullAggregation,
} from "./pull-aggregation.js";

// Reusable aggregation primitives
export * from "./aggregations/index.js";
