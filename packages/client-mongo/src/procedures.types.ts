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

import type { CollectionStats, DatabaseInfo } from "./types.js";

// =============================================================================
// Input and output types
// =============================================================================
// These are the types the handlers use: each procedure file exports them, so this
// interface cannot drift from the handlers. (BUGS-2026-07 M17: the copies kept here before
// had drifted from what the handlers accept and return.)

import type { PingInput, PingOutput } from "./procedures/database.ping.js";
import type { InfoInput } from "./procedures/database.info.js";
import type { ListInput as ListCollectionsInput, ListOutput as ListCollectionsOutput } from "./procedures/collections.list.js";
import type { CreateInput as CreateCollectionInput, CreateOutput as CreateCollectionOutput } from "./procedures/collections.create.js";
import type { DropInput as DropCollectionInput, DropOutput as DropCollectionOutput } from "./procedures/collections.drop.js";
import type { StatsInput } from "./procedures/collections.stats.js";
import type { FindInput, FindOutput } from "./procedures/documents.find.js";
import type { GetInput, GetOutput } from "./procedures/documents.get.js";
import type { InsertInput, InsertOutput } from "./procedures/documents.insert.js";
import type { UpdateInput, UpdateOutput } from "./procedures/documents.update.js";
import type { DeleteInput, DeleteOutput } from "./procedures/documents.delete.js";
import type { CountInput, CountOutput } from "./procedures/documents.count.js";
import type { AggregateInput, AggregateOutput } from "./procedures/documents.aggregate.js";
import type { ListIndexesInput, ListIndexesOutput } from "./procedures/indexes.list.js";
import type { CreateIndexInput, CreateIndexOutput } from "./procedures/indexes.create.js";
import type { DropIndexInput, DropIndexOutput } from "./procedures/indexes.drop.js";

export type {
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
  ListIndexesInput,
  ListIndexesOutput,
  CreateIndexInput,
  CreateIndexOutput,
  DropIndexInput,
  DropIndexOutput,
};

// =============================================================================
// Combined Procedures Interface
// =============================================================================

/**
 * Typed interface for all MongoDB procedures.
 * Use with createTypedCaller for compile-time autocomplete.
 */
export interface MongoProcedures {
  mongo: {
    database: {
      ping: { input: PingInput; output: PingOutput };
      info: { input: InfoInput; output: DatabaseInfo };
    };
    collections: {
      list: { input: ListCollectionsInput; output: ListCollectionsOutput };
      create: { input: CreateCollectionInput; output: CreateCollectionOutput };
      drop: { input: DropCollectionInput; output: DropCollectionOutput };
      stats: { input: StatsInput; output: CollectionStats };
    };
    documents: {
      find: { input: FindInput; output: FindOutput };
      get: { input: GetInput; output: GetOutput };
      insert: { input: InsertInput; output: InsertOutput };
      update: { input: UpdateInput; output: UpdateOutput };
      delete: { input: DeleteInput; output: DeleteOutput };
      count: { input: CountInput; output: CountOutput };
      aggregate: { input: AggregateInput; output: AggregateOutput };
    };
    indexes: {
      list: { input: ListIndexesInput; output: ListIndexesOutput };
      create: { input: CreateIndexInput; output: CreateIndexOutput };
      drop: { input: DropIndexInput; output: DropIndexOutput };
    };
  };
}

/**
 * Helper type to extract input type from a procedure path
 */
export type ProcedureInput<P extends readonly string[]> =
  P extends ["mongo", "database", "ping"] ? PingInput :
  P extends ["mongo", "database", "info"] ? InfoInput :
  P extends ["mongo", "collections", "list"] ? ListCollectionsInput :
  P extends ["mongo", "collections", "create"] ? CreateCollectionInput :
  P extends ["mongo", "collections", "drop"] ? DropCollectionInput :
  P extends ["mongo", "collections", "stats"] ? StatsInput :
  P extends ["mongo", "documents", "find"] ? FindInput :
  P extends ["mongo", "documents", "get"] ? GetInput :
  P extends ["mongo", "documents", "insert"] ? InsertInput :
  P extends ["mongo", "documents", "update"] ? UpdateInput :
  P extends ["mongo", "documents", "delete"] ? DeleteInput :
  P extends ["mongo", "documents", "count"] ? CountInput :
  P extends ["mongo", "documents", "aggregate"] ? AggregateInput :
  P extends ["mongo", "indexes", "list"] ? ListIndexesInput :
  P extends ["mongo", "indexes", "create"] ? CreateIndexInput :
  P extends ["mongo", "indexes", "drop"] ? DropIndexInput :
  never;

/**
 * Helper type to extract output type from a procedure path
 */
export type ProcedureOutput<P extends readonly string[]> =
  P extends ["mongo", "database", "ping"] ? PingOutput :
  P extends ["mongo", "database", "info"] ? DatabaseInfo :
  P extends ["mongo", "collections", "list"] ? ListCollectionsOutput :
  P extends ["mongo", "collections", "create"] ? CreateCollectionOutput :
  P extends ["mongo", "collections", "drop"] ? DropCollectionOutput :
  P extends ["mongo", "collections", "stats"] ? CollectionStats :
  P extends ["mongo", "documents", "find"] ? FindOutput :
  P extends ["mongo", "documents", "get"] ? GetOutput :
  P extends ["mongo", "documents", "insert"] ? InsertOutput :
  P extends ["mongo", "documents", "update"] ? UpdateOutput :
  P extends ["mongo", "documents", "delete"] ? DeleteOutput :
  P extends ["mongo", "documents", "count"] ? CountOutput :
  P extends ["mongo", "documents", "aggregate"] ? AggregateOutput :
  P extends ["mongo", "indexes", "list"] ? ListIndexesOutput :
  P extends ["mongo", "indexes", "create"] ? CreateIndexOutput :
  P extends ["mongo", "indexes", "drop"] ? DropIndexOutput :
  never;
