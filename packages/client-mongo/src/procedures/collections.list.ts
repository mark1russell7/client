/**
 * Procedure: mongo.collections.list
 * List all collections in the database
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta } from "../types.js";

// Input/Output types
interface ListInput {
  [key: string]: never;
}

interface ListOutput {
  collections: string[];
}

// Schemas
const listInputSchema = schema<ListInput>();
const listOutputSchema = schema<ListOutput>();

export const listProcedure: Procedure<
  ListInput,
  ListOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "collections", "list"])
  .input(listInputSchema)
  .output(listOutputSchema)
  .meta({ description: "List all collections in the database" })
  .handler(async (_input: ListInput, ctx: ProcedureContext) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();

    const collections = await db.listCollections().toArray();
    const collectionNames = collections
      .filter((c) => c.type === "collection")
      .map((c) => c.name)
      .sort();

    return {
      collections: collectionNames,
    };
  })
  .build();

export type { ListInput, ListOutput };
