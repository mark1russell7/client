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
export { connect, disconnect, getDb, getClient, getDefaultConnection, setDefaultConnection, hasDefaultConnection, } from "./connection.js";
export type { MongoConnection, MongoConnectionOptions } from "./connection.js";
export { hasCollection, requireCollection, getBaseMeta, } from "./types.js";
export type { MongoProcedures, ProcedureInput, ProcedureOutput, PingInput, PingOutput, InfoInput, ListCollectionsInput, ListCollectionsOutput, CreateCollectionInput, CreateCollectionOutput, DropCollectionInput, DropCollectionOutput, StatsInput, FindInput, FindOutput, GetInput, GetOutput, InsertInput, InsertOutput, UpdateInput, UpdateOutput, DeleteInput, DeleteOutput, CountInput, CountOutput, AggregateInput, AggregateOutput, ListIndexesInput, ListIndexesOutput, CreateIndexInput, CreateIndexOutput, DropIndexInput, DropIndexOutput, } from "./procedures.types.js";
export type { PaginationInput, PaginationOutput, SortOrder, SortSpec, DocumentId, BaseDocument, MongoDocument, DocumentQuery, DocumentUpdate, BaseMeta, CollectionMeta, BulkInsertOne, BulkUpdateOne, BulkDeleteOne, BulkOperation, BulkWriteResult, IndexSpec, IndexOptions, IndexInfo, CollectionOptions, CollectionStats, DatabaseInfo, AggregationStage, AggregationOptions, } from "./types.js";
export { registerMongoProcedures, procedures } from "./register.js";
export * from "./procedures/index.js";
export type { Db, Collection, Document, ObjectId, Filter, UpdateFilter, FindOptions, AggregateOptions, } from "mongodb";
//# sourceMappingURL=index.d.ts.map