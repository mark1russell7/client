/**
 * TypeScript types for client-mongo procedures
 */
import type { ObjectId, Document, Filter, UpdateFilter } from "mongodb";
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
export declare function hasCollection(metadata: Record<string, unknown>): metadata is CollectionMeta;
/**
 * Type guard to get collection metadata, throws if missing
 */
export declare function requireCollection(metadata: Record<string, unknown>): CollectionMeta;
/**
 * Get base metadata (database override).
 * BaseMeta extends Record<string, unknown> so this is type-safe.
 */
export declare function getBaseMeta(metadata: Record<string, unknown>): BaseMeta;
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
//# sourceMappingURL=types.d.ts.map