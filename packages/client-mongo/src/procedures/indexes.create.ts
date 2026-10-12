/**
 * Procedure: mongo.indexes.create
 * Create an index on a collection
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";
import type { CreateIndexesOptions } from "mongodb";
import { type IndexSpec, type IndexOptions } from "../types.js";

// Input/Output types
interface CreateIndexInput extends ScopeInput {
  keys: IndexSpec;
  options?: IndexOptions | undefined;
}

interface CreateIndexOutput {
  acknowledged: boolean;
  indexName: string;
}

// Schemas
const createIndexInputSchema = zodAdapter<CreateIndexInput>(
  z.object({
    ...scopeFields(),
    keys: z
      .record(z.string(), z.union([z.literal(1), z.literal(-1), z.literal("text"), z.literal("2dsphere")]))
      .describe('The fields of the index and their order: 1, -1, "text" or "2dsphere"'),
    options: z
      .looseObject({
        name: z.string().optional().describe("The name of the index"),
        unique: z.boolean().optional().describe("A unique index"),
        sparse: z.boolean().optional().describe("A sparse index"),
      })
      .optional()
      .describe("The options of the index"),
  })
);
const createIndexOutputSchema = zodAdapter<CreateIndexOutput>(
  z.looseObject({
    acknowledged: z.boolean().describe("True when the server confirmed the write"),
    indexName: z.string().describe("The name of the new index"),
  })
);

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

    // The schema leaves out an option that the input does not give: no option is undefined at run time
    const indexName = await collection.createIndex(input.keys, input.options as CreateIndexesOptions | undefined);

    return {
      acknowledged: true,
      indexName,
    };
  })
  .build();

export type { CreateIndexInput, CreateIndexOutput };
