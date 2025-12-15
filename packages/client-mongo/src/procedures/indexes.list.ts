/**
 * Procedure: mongo.indexes.list
 * List indexes on a collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, type IndexInfo } from "../types.js";

// Input/Output types
interface ListIndexesInput {
  [key: string]: never;
}

interface ListIndexesOutput {
  indexes: IndexInfo[];
}

// Schemas
const listIndexesInputSchema = schema<ListIndexesInput>();
const listIndexesOutputSchema = schema<ListIndexesOutput>();

export const listIndexesProcedure: Procedure<
  ListIndexesInput,
  ListIndexesOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "indexes", "list"])
  .input(listIndexesInputSchema)
  .output(listIndexesOutputSchema)
  .meta({ description: "List indexes on a collection" })
  .handler(async (_input: ListIndexesInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    const indexes = await collection.listIndexes().toArray();

    return {
      indexes: indexes.map((idx) => ({
        name: idx.name,
        key: idx.key,
        unique: idx.unique,
        sparse: idx.sparse,
      })),
    };
  })
  .build();

export type { ListIndexesInput, ListIndexesOutput };
