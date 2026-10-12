/**
 * Procedure: mongo.indexes.drop
 * Drop an index from a collection
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";

// Input/Output types
interface DropIndexInput extends ScopeInput {
  indexName: string;
}

interface DropIndexOutput {
  acknowledged: boolean;
}

// Schemas
const dropIndexInputSchema = zodAdapter<DropIndexInput>(
  z.object({
    ...scopeFields(),
    indexName: z.string().min(1).describe("The name of the index to drop"),
  })
);
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
    const { collection } = await collectionFor(input, ctx);

    await collection.dropIndex(input.indexName);

    return {
      acknowledged: true,
    };
  })
  .build();

export type { DropIndexInput, DropIndexOutput };
