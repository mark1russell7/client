/**
 * Procedure: mongo.indexes.create
 * Create an index on a collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, type IndexSpec, type IndexOptions } from "../types.js";

// Input/Output types
interface CreateIndexInput {
  keys: IndexSpec;
  options?: IndexOptions;
}

interface CreateIndexOutput {
  acknowledged: boolean;
  indexName: string;
}

// Schemas
const createIndexInputSchema = schema<CreateIndexInput>();
const createIndexOutputSchema = schema<CreateIndexOutput>();

export const createIndexProcedure: Procedure<
  CreateIndexInput,
  CreateIndexOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "indexes", "create"])
  .input(createIndexInputSchema)
  .output(createIndexOutputSchema)
  .meta({ description: "Create an index on a collection" })
  .handler(async (input: CreateIndexInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    const indexName = await collection.createIndex(input.keys, input.options);

    return {
      acknowledged: true,
      indexName,
    };
  })
  .build();

export type { CreateIndexInput, CreateIndexOutput };
