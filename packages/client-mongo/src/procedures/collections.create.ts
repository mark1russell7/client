/**
 * Procedure: mongo.collections.create
 * Create a new collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta, type CollectionOptions } from "../types.js";

// Input/Output types
interface CreateInput {
  name: string;
  options?: CollectionOptions;
}

interface CreateOutput {
  acknowledged: boolean;
  collectionName: string;
}

// Schemas
const createInputSchema = schema<CreateInput>();
const createOutputSchema = schema<CreateOutput>();

export const createCollectionProcedure: Procedure<
  CreateInput,
  CreateOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "collections", "create"])
  .input(createInputSchema)
  .output(createOutputSchema)
  .meta({ description: "Create a new collection" })
  .handler(async (input: CreateInput, ctx: ProcedureContext) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();

    await db.createCollection(input.name, input.options);

    return {
      acknowledged: true,
      collectionName: input.name,
    };
  })
  .build();

export type { CreateInput, CreateOutput };
