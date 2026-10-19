/**
 * MongoDB Storage Exports
 */

export { MongoStorage } from "./mongo-storage.js";
export type { MongoStorageOptions } from "./mongo-storage.js";
export { MongoDocumentStorage, selectorPrefilter } from "./document-storage.js";
export type { MongoDocumentStorageOptions } from "./document-storage.js";
export {
  BLOCKED_PIPELINE_OPERATORS,
  ALLOWED_PIPELINE_STAGES,
  DEFAULT_PIPELINE_LIMITS,
  assertNoBlockedOperators,
  boundPipeline,
  cutResults,
  isTimeLimitError,
  scopePipeline,
} from "./pipeline-scope.js";
export type { PipelineLimits, PipelineScope } from "./pipeline-scope.js";
// Materialized views driven by change streams (Graph's split plan, P4)
export { ViewMaterializer, identityPartition, partitionTargetId, viewFilter, VIEW_GENERATION_FIELD, VIEW_HASH_FIELD } from "./materializer.js";
export type { MaterializedView, MaterializedViewStatus, ViewMaterializerOptions, ViewPartitionOf, ViewPipelineScope, ViewTargetId } from "./materializer.js";
// A read-only storage of a view for the collection procedures: one generation for each read (roadmap CLI-38)
export { MongoViewStorage } from "./view-storage.js";
export type { MongoViewStorageOptions } from "./view-storage.js";
