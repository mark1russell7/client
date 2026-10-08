/**
 * Typed Procedures Interface
 *
 * Provides compile-time autocomplete for client-mongo procedures.
 * Import this type and use with a typed caller for full type safety.
 *
 * @example
 * ```typescript
 * import type { MongoProcedures } from "@mark1russell7/client-mongo";
 * import { createTypedCaller } from "@mark1russell7/client";
 *
 * const call = createTypedCaller<MongoProcedures>(client.call);
 *
 * // Full autocomplete on path and input!
 * const result = await call(
 *   ["mongo", "documents", "find"],
 *   { query: { status: "active" } },
 *   { metadata: { collection: "users" } }
 * );
 * // result is typed as FindOutput
 * ```
 */
import type { PaginationOutput, DocumentQuery, DocumentUpdate, SortSpec, MongoDocument, CollectionStats, CollectionOptions, DatabaseInfo, IndexSpec, IndexOptions, IndexInfo, AggregationStage, AggregationOptions } from "./types.js";
export interface PingInput {
    /** Optional timeout in milliseconds */
    timeout?: number;
}
export interface PingOutput {
    /** Response time in milliseconds */
    latencyMs: number;
    /** Server status */
    ok: boolean;
}
export interface InfoInput {
    /** Include detailed stats */
    includeStats?: boolean;
}
export interface ListCollectionsInput {
    /** Filter by name pattern */
    filter?: string;
}
export interface ListCollectionsOutput {
    /** Collection names */
    collections: string[];
}
export interface CreateCollectionInput {
    /** Collection name */
    name: string;
    /** Collection options */
    options?: CollectionOptions;
}
export interface CreateCollectionOutput {
    /** Whether creation was successful */
    created: boolean;
    /** Collection name */
    name: string;
}
export interface DropCollectionInput {
    /** Collection name */
    name: string;
}
export interface DropCollectionOutput {
    /** Whether drop was successful */
    dropped: boolean;
}
export interface StatsInput {
}
export interface FindInput {
    /** Query filter */
    query?: DocumentQuery;
    /** Field projection */
    projection?: Record<string, 0 | 1>;
    /** Sort specification */
    sort?: SortSpec;
    /** Page number (1-indexed) */
    page?: number;
    /** Items per page (max 100) */
    limit?: number;
}
export interface FindOutput {
    /** Found documents */
    documents: MongoDocument[];
    /** Pagination info */
    pagination: PaginationOutput;
}
export interface GetInput {
    /** Document ID */
    id: string;
}
export interface GetOutput {
    /** Found document or null */
    document: MongoDocument | null;
}
export interface InsertInput {
    /** Document or documents to insert */
    documents: MongoDocument | MongoDocument[];
}
export interface InsertOutput {
    /** Number of documents inserted */
    insertedCount: number;
    /** Inserted document IDs */
    insertedIds: string[];
}
export interface UpdateInput {
    /** Query filter */
    query: DocumentQuery;
    /** Update specification */
    update: DocumentUpdate;
    /** Update all matching documents */
    multi?: boolean;
    /** Insert if not found */
    upsert?: boolean;
}
export interface UpdateOutput {
    /** Number of documents matched */
    matchedCount: number;
    /** Number of documents modified */
    modifiedCount: number;
    /** Upserted document ID (if any) */
    upsertedId?: string;
}
export interface DeleteInput {
    /** Query filter */
    query: DocumentQuery;
    /** Delete all matching documents */
    multi?: boolean;
}
export interface DeleteOutput {
    /** Number of documents deleted */
    deletedCount: number;
}
export interface CountInput {
    /** Query filter */
    query?: DocumentQuery;
}
export interface CountOutput {
    /** Document count */
    count: number;
}
export interface AggregateInput {
    /** Aggregation pipeline stages */
    pipeline: AggregationStage[];
    /** Aggregation options */
    options?: AggregationOptions;
}
export interface AggregateOutput {
    /** Aggregation results */
    results: MongoDocument[];
}
export interface ListIndexesInput {
}
export interface ListIndexesOutput {
    /** Index information */
    indexes: IndexInfo[];
}
export interface CreateIndexInput {
    /** Index key specification */
    keys: IndexSpec;
    /** Index options */
    options?: IndexOptions;
}
export interface CreateIndexOutput {
    /** Index name */
    name: string;
}
export interface DropIndexInput {
    /** Index name to drop */
    name: string;
}
export interface DropIndexOutput {
    /** Whether drop was successful */
    dropped: boolean;
}
/**
 * Typed interface for all MongoDB procedures.
 * Use with createTypedCaller for compile-time autocomplete.
 */
export interface MongoProcedures {
    mongo: {
        database: {
            ping: {
                input: PingInput;
                output: PingOutput;
            };
            info: {
                input: InfoInput;
                output: DatabaseInfo;
            };
        };
        collections: {
            list: {
                input: ListCollectionsInput;
                output: ListCollectionsOutput;
            };
            create: {
                input: CreateCollectionInput;
                output: CreateCollectionOutput;
            };
            drop: {
                input: DropCollectionInput;
                output: DropCollectionOutput;
            };
            stats: {
                input: StatsInput;
                output: CollectionStats;
            };
        };
        documents: {
            find: {
                input: FindInput;
                output: FindOutput;
            };
            get: {
                input: GetInput;
                output: GetOutput;
            };
            insert: {
                input: InsertInput;
                output: InsertOutput;
            };
            update: {
                input: UpdateInput;
                output: UpdateOutput;
            };
            delete: {
                input: DeleteInput;
                output: DeleteOutput;
            };
            count: {
                input: CountInput;
                output: CountOutput;
            };
            aggregate: {
                input: AggregateInput;
                output: AggregateOutput;
            };
        };
        indexes: {
            list: {
                input: ListIndexesInput;
                output: ListIndexesOutput;
            };
            create: {
                input: CreateIndexInput;
                output: CreateIndexOutput;
            };
            drop: {
                input: DropIndexInput;
                output: DropIndexOutput;
            };
        };
    };
}
/**
 * Helper type to extract input type from a procedure path
 */
export type ProcedureInput<P extends readonly string[]> = P extends ["mongo", "database", "ping"] ? PingInput : P extends ["mongo", "database", "info"] ? InfoInput : P extends ["mongo", "collections", "list"] ? ListCollectionsInput : P extends ["mongo", "collections", "create"] ? CreateCollectionInput : P extends ["mongo", "collections", "drop"] ? DropCollectionInput : P extends ["mongo", "collections", "stats"] ? StatsInput : P extends ["mongo", "documents", "find"] ? FindInput : P extends ["mongo", "documents", "get"] ? GetInput : P extends ["mongo", "documents", "insert"] ? InsertInput : P extends ["mongo", "documents", "update"] ? UpdateInput : P extends ["mongo", "documents", "delete"] ? DeleteInput : P extends ["mongo", "documents", "count"] ? CountInput : P extends ["mongo", "documents", "aggregate"] ? AggregateInput : P extends ["mongo", "indexes", "list"] ? ListIndexesInput : P extends ["mongo", "indexes", "create"] ? CreateIndexInput : P extends ["mongo", "indexes", "drop"] ? DropIndexInput : never;
/**
 * Helper type to extract output type from a procedure path
 */
export type ProcedureOutput<P extends readonly string[]> = P extends ["mongo", "database", "ping"] ? PingOutput : P extends ["mongo", "database", "info"] ? DatabaseInfo : P extends ["mongo", "collections", "list"] ? ListCollectionsOutput : P extends ["mongo", "collections", "create"] ? CreateCollectionOutput : P extends ["mongo", "collections", "drop"] ? DropCollectionOutput : P extends ["mongo", "collections", "stats"] ? CollectionStats : P extends ["mongo", "documents", "find"] ? FindOutput : P extends ["mongo", "documents", "get"] ? GetOutput : P extends ["mongo", "documents", "insert"] ? InsertOutput : P extends ["mongo", "documents", "update"] ? UpdateOutput : P extends ["mongo", "documents", "delete"] ? DeleteOutput : P extends ["mongo", "documents", "count"] ? CountOutput : P extends ["mongo", "documents", "aggregate"] ? AggregateOutput : P extends ["mongo", "indexes", "list"] ? ListIndexesOutput : P extends ["mongo", "indexes", "create"] ? CreateIndexOutput : P extends ["mongo", "indexes", "drop"] ? DropIndexOutput : never;
//# sourceMappingURL=procedures.types.d.ts.map