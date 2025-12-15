/**
 * @mark1russell7/client-mongo
 *
 * MongoDB client wrapper with client procedures for RPC access.
 * Use locally with direct MongoDB connection or remotely via client.call().
 *
 * @example
 * ```typescript
 * // Local usage - connect and use procedures
 * import { connect } from "@mark1russell7/client-mongo";
 *
 * await connect({ uri: "mongodb://localhost:27017", database: "myapp" });
 *
 * // Via RPC client
 * import { Client } from "client";
 *
 * const result = await client.call(
 *   ["mongo", "documents", "find"],
 *   { query: { status: "active" }, limit: 10 },
 *   { metadata: { collection: "users" } }
 * );
 * ```
 */

// =============================================================================
// Connection Management
// =============================================================================

export {
  connect,
  disconnect,
  getDb,
  getClient,
  getDefaultConnection,
  setDefaultConnection,
  hasDefaultConnection,
} from "./connection.js";

export type { MongoConnection, MongoConnectionOptions } from "./connection.js";

// =============================================================================
// Types
// =============================================================================

export {
  // Type guards
  hasCollection,
  requireCollection,
  getBaseMeta,
} from "./types.js";

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
  BulkDeleteOne,
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
// Procedure Registration
// =============================================================================

export { registerMongoProcedures, procedures } from "./register.js";

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
