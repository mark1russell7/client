/**
 * @procedures/mongo
 *
 * MongoDB client wrapper with client procedures for RPC access.
 * Use locally with direct MongoDB connection or remotely via client.call().
 *
 * @example
 * ```typescript
 * // Local usage: the first call connects (MONGODB_URI, or configure())
 * import { configure } from "@procedures/mongo";
 *
 * configure({ uri: "mongodb://localhost:27017", database: "myapp" });
 *
 * // Via RPC client
 * import { Client } from "client";
 *
 * const result = await client.call(
 *   ["mongo", "documents", "find"],
 *   { collection: "users", query: { status: "active" }, limit: 10 },
 * );
 * ```
 */

// =============================================================================
// Connection Management
// =============================================================================

export {
  connect,
  configure,
  ensureConnection,
  disconnect,
  getDb,
  getClient,
  getDefaultConnection,
  setDefaultConnection,
  hasDefaultConnection,
} from "./connection.js";

export type { MongoConnection, MongoConnectionOptions } from "./connection.js";
export type { ScopeInput } from "./scope.js";

// =============================================================================
// Types
// =============================================================================

export {
  // Type guards
  hasCollection,
  requireCollection,
  getBaseMeta,
} from "./types.js";

// Typed procedures interface for autocomplete
export type {
  MongoProcedures,
  ProcedureInput,
  ProcedureOutput,
  // Individual procedure types
  PingInput,
  PingOutput,
  InfoInput,
  ListCollectionsInput,
  ListCollectionsOutput,
  CreateCollectionInput,
  CreateCollectionOutput,
  DropCollectionInput,
  DropCollectionOutput,
  StatsInput,
  FindInput,
  FindOutput,
  GetInput,
  GetOutput,
  InsertInput,
  InsertOutput,
  UpdateInput,
  UpdateOutput,
  DeleteInput,
  DeleteOutput,
  CountInput,
  CountOutput,
  AggregateInput,
  AggregateOutput,
  DistinctInput,
  DistinctOutput,
  BulkInput,
  BulkOutput,
  ExplainInput,
  ExplainOutput,
  WatchInput,
  WatchChange,
  ListIndexesInput,
  ListIndexesOutput,
  CreateIndexInput,
  CreateIndexOutput,
  DropIndexInput,
  DropIndexOutput,
} from "./procedures.types.js";

export type {
  // Common
  PaginationInput,
  PaginationOutput,
  SortOrder,
  SortSpec,
  // Documents
  DocumentId,
  BaseDocument,
  MongoDocument,
  DocumentQuery,
  DocumentUpdate,
  // Metadata
  BaseMeta,
  CollectionMeta,
  // Bulk operations
  BulkInsertOne,
  BulkUpdateOne,
  BulkUpdateMany,
  BulkDeleteOne,
  BulkDeleteMany,
  BulkOperation,
  BulkWriteResult,
  // Indexes
  IndexSpec,
  IndexOptions,
  IndexInfo,
  // Collections
  CollectionOptions,
  CollectionStats,
  // Database
  DatabaseInfo,
  // Aggregation
  AggregationStage,
  AggregationOptions,
} from "./types.js";

// =============================================================================
// Storage (CollectionStorage implementation)
// =============================================================================

export {
  MongoStorage,
  MongoDocumentStorage,
  selectorPrefilter,
  DOCUMENT_STORAGE_FIELDS,
  TOMBSTONE_FIELD,
  DEFAULT_STORED_FORM,
  decodeStoredDocument,
  versionOfStored,
} from "./storage/index.js";
export type { MongoStorageOptions, MongoDocumentStorageOptions, SelectorPrefilterOptions, StoredForm, DecodeStoredDocumentOptions, StoredDocumentEntry } from "./storage/index.js";
// The change hints of a storage collection from its change stream (roadmap CLI-77)
export { watchStorageChanges, storageChangeOf } from "./storage/index.js";
export type { StorageChange, StorageChangeHint, StorageChangesWatch, StorageHintPublisher, WatchStorageChangesOptions } from "./storage/index.js";
// One change watcher for a whole database, with resume and backoff (roadmap CLI-88)
export { watchDatabaseChanges } from "./storage/index.js";
export type { DatabaseChangesWatch, WatchDatabaseChangesOptions } from "./storage/index.js";
// The guard of an aggregation pipeline over shared collections, and its limits (Graph's split plan, P3)
export {
  BLOCKED_PIPELINE_OPERATORS,
  ALLOWED_PIPELINE_STAGES,
  DEFAULT_PIPELINE_LIMITS,
  assertNoBlockedOperators,
  boundPipeline,
  cutResults,
  isTimeLimitError,
  scopePipeline,
} from "./storage/index.js";
export type { PipelineLimits, PipelineScope } from "./storage/index.js";

// =============================================================================
// Procedure Registration
// =============================================================================

export { registerMongoProcedures, procedures } from "./module.js";

// =============================================================================
// Individual Procedures (for direct import if needed)
// =============================================================================

export * from "./procedures/index.js";

// =============================================================================
// Re-export mongodb types users may need
// =============================================================================

export type {
  Db,
  Collection,
  Document,
  ObjectId,
  Filter,
  UpdateFilter,
  FindOptions,
  AggregateOptions,
} from "mongodb";
// Materialized views driven by change streams (Graph's split plan, P4)
export { ViewMaterializer, identityPartition, partitionTargetId, viewFilter, VIEW_GENERATION_FIELD, VIEW_HASH_FIELD } from "./storage/index.js";
export type { MaterializedView, MaterializedViewStatus, ViewMaterializerOptions, ViewPartitionOf, ViewPipelineScope, ViewStorageSource, ViewTargetId } from "./storage/index.js";
// A read-only storage of a view for the collection procedures: one generation for each read (roadmap CLI-38)
export { MongoViewStorage } from "./storage/index.js";
export type { MongoViewStorageOptions } from "./storage/index.js";
