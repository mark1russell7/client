/**
 * TypeScript types for client-mongo procedures
 */

import { ObjectId } from "mongodb";
import type { Document, Filter, UpdateFilter } from "mongodb";

// =============================================================================
// Common Types
// =============================================================================

/**
 * Pagination input parameters
 */
export interface PaginationInput {
  /** Page number (1-indexed, default: 1) */
  page?: number;
  /** Items per page (default: 20, max: 100) */
  limit?: number;
}

/**
 * Pagination output metadata
 */
export interface PaginationOutput {
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrev: boolean;
}

/**
 * Sort order for queries
 */
export type SortOrder = 1 | -1;

/**
 * Sort specification
 */
export type SortSpec = Record<string, SortOrder>;

// =============================================================================
// Document Types
// =============================================================================

/**
 * Document ID - can be string or ObjectId.
 * MongoDB supports any type for _id, but string and ObjectId are most common.
 */
export type DocumentId = string | ObjectId;

/**
 * Base document type.
 * Uses MongoDB's Document type which allows any _id via index signature.
 */
export type BaseDocument = Document;

/**
 * Generic document type - use BaseDocument for proper _id typing
 */
export type MongoDocument = BaseDocument;

/**
 * Document query filter.
 * Uses Document for compatibility with MongoDB driver methods.
 */
export type DocumentQuery = Filter<Document>;

/**
 * Document update specification
 */
export type DocumentUpdate = UpdateFilter<Document>;

/**
 * How to interpret a string id when building an `_id` filter.
 *
 * - `"objectId"` — coerce to an ObjectId (falls back to the raw string when the
 *   value is not a valid ObjectId).
 * - `"string"` — match the raw string `_id` only.
 * - `"auto"` (default) — when the id is a valid ObjectId, match EITHER an
 *   ObjectId `_id` or the raw string `_id`, so documents stored with a
 *   string `_id` that happens to be 24-hex (e.g. MongoStorage keys) stay
 *   reachable. Otherwise match the string.
 */
export type IdType = "auto" | "objectId" | "string";

/**
 * Build an `_id` filter from a string id.
 *
 * MongoDB supports any `_id` type at runtime. Previously any string that parsed
 * as an ObjectId was silently coerced, making 24-hex *string* `_id`s
 * unreachable. The default `"auto"` mode now queries both forms via `$or` when
 * the id is ambiguous, and `idType` provides an explicit escape hatch.
 */
export function buildIdFilter(id: string, idType: IdType = "auto"): Document {
  if (idType === "string") {
    return { _id: id };
  }

  let objectId: ObjectId | null = null;
  try {
    objectId = new ObjectId(id);
  } catch {
    objectId = null;
  }

  if (idType === "objectId") {
    return { _id: objectId ?? id };
  }

  // "auto": match both the ObjectId and the raw string when ambiguous.
  if (objectId) {
    return { $or: [{ _id: objectId }, { _id: id }] };
  }
  return { _id: id };
}

// =============================================================================
// Procedure Metadata Types
// =============================================================================

/**
 * Base metadata for all procedures
 */
export interface BaseMeta extends Record<string, unknown> {
  /** Override database name */
  database?: string;
}

/**
 * Metadata for collection-scoped procedures
 */
export interface CollectionMeta extends BaseMeta {
  /** Collection name (required) */
  collection: string;
}

/**
 * Type guard to check if metadata has collection
 */
export function hasCollection(
  metadata: Record<string, unknown>
): metadata is CollectionMeta {
  return typeof metadata["collection"] === "string";
}

/**
 * Type guard to get collection metadata, throws if missing
 */
export function requireCollection(
  metadata: Record<string, unknown>
): CollectionMeta {
  if (!hasCollection(metadata)) {
    throw new Error("collection is required in metadata");
  }
  if (metadata.collection.trim().length === 0) {
    throw new Error("collection must be a non-empty string");
  }
  return metadata;
}

/**
 * Get base metadata (database override).
 * BaseMeta extends Record<string, unknown> so this is type-safe.
 */
export function getBaseMeta(metadata: Record<string, unknown>): BaseMeta {
  return metadata;
}

// =============================================================================
// Bulk Operation Types
// =============================================================================

/**
 * Insert operation for bulk write
 */
export interface BulkInsertOne {
  insertOne: {
    document: Document;
  };
}

/**
 * Update operation for bulk write
 */
export interface BulkUpdateOne {
  updateOne: {
    filter: DocumentQuery;
    update: DocumentUpdate;
    upsert?: boolean;
  };
}

/**
 * Delete operation for bulk write
 */
export interface BulkDeleteOne {
  deleteOne: {
    filter: DocumentQuery;
  };
}

/**
 * Bulk operation union type
 */
export type BulkOperation = BulkInsertOne | BulkUpdateOne | BulkDeleteOne;

/**
 * Result of a bulk write operation
 */
export interface BulkWriteResult {
  acknowledged: boolean;
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
}

// =============================================================================
// Index Types
// =============================================================================

/**
 * Index key specification
 */
export type IndexSpec = Record<string, 1 | -1 | "text" | "2dsphere">;

/**
 * Index creation options
 */
export interface IndexOptions {
  /** Index name */
  name?: string;
  /** Unique index */
  unique?: boolean;
  /** Sparse index */
  sparse?: boolean;
  /** Build in background */
  background?: boolean;
  /** TTL in seconds */
  expireAfterSeconds?: number;
}

/**
 * Index information returned by listIndexes
 */
export interface IndexInfo {
  name: string;
  key: IndexSpec;
  unique?: boolean;
  sparse?: boolean;
}

// =============================================================================
// Collection Types
// =============================================================================

/**
 * Collection creation options
 */
export interface CollectionOptions {
  /** Create a capped collection */
  capped?: boolean;
  /** Max size in bytes (for capped) */
  size?: number;
  /** Max documents (for capped) */
  max?: number;
  /** JSON Schema validator */
  validator?: Document;
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  /** Number of documents */
  count: number;
  /** Size of documents in bytes */
  size: number;
  /** Average document size */
  avgObjSize: number;
  /** Total storage size */
  storageSize: number;
  /** Number of indexes */
  nindexes: number;
  /** Total index size */
  totalIndexSize: number;
}

// =============================================================================
// Database Types
// =============================================================================

/**
 * Database information
 */
export interface DatabaseInfo {
  /** Database name */
  name: string;
  /** Number of collections */
  collections: number;
  /** Number of views */
  views: number;
  /** Size on disk in bytes */
  sizeOnDisk: number;
  /** Whether database is empty */
  empty: boolean;
}

// =============================================================================
// Aggregation Types
// =============================================================================

/**
 * Aggregation pipeline stage
 */
export type AggregationStage = Document;

/**
 * Aggregation options
 */
export interface AggregationOptions {
  /** Allow disk use for large operations */
  allowDiskUse?: boolean;
  /** Max execution time in ms */
  maxTimeMS?: number;
}
