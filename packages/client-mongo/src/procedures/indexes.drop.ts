/**
 * Procedure: mongo.indexes.drop
 * Drop an index from a collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";

// Input/Output types
interface DropIndexInput {
  indexName: string;
}

interface DropIndexOutput {
  acknowledged: boolean;
}

// Schemas
const dropIndexInputSchema = schema<DropIndexInput>();
const dropIndexOutputSchema = schema<DropIndexOutput>();

export const dropIndexProcedure: Procedure<
  DropIndexInput,
  DropIndexOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "indexes", "drop"])
  .input(dropIndexInputSchema)
  .output(dropIndexOutputSchema)
  .meta({ description: "Drop an index from a collection" })
  .handler(async (input: DropIndexInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    await collection.dropIndex(input.indexName);

    return {
      acknowledged: true,
    };
  })
  .build();

export type { DropIndexInput, DropIndexOutput };
