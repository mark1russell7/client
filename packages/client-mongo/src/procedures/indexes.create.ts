/**
 * Procedure: mongo.indexes.create
 * Create an index on a collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import { type IndexSpec, type IndexOptions } from "../types.js";

// Input/Output types
interface CreateIndexInput extends ScopeInput {
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
    const { collection } = await collectionFor(input, ctx);

    const indexName = await collection.createIndex(input.keys, input.options);

    return {
      acknowledged: true,
      indexName,
    };
  })
  .build();

export type { CreateIndexInput, CreateIndexOutput };
