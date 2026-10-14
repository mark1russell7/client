/**
 * Procedure: mongo.collections.create
 * Create a new collection
 */

import { createProcedure, zodAdapter, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { databaseFor, type ScopeInput } from "../scope.js";
import { scopeFields, documentObject } from "./input-schemas.js";
import { z } from "zod";
import type { CreateCollectionOptions } from "mongodb";
import { type CollectionOptions } from "../types.js";

// Input/Output types
interface CreateInput extends ScopeInput {
  name: string;
  options?: CollectionOptions | undefined;
}

interface CreateOutput {
  acknowledged: boolean;
  collectionName: string;
}

// Schemas
const createInputSchema = zodAdapter<CreateInput>(
  z.object({
    ...scopeFields(),
    name: z.string().min(1).describe("The name of the new collection"),
    options: z
      .looseObject({
        capped: z.boolean().optional().describe("Make a capped collection"),
        size: z.number().optional().describe("The maximum size in bytes (capped collections)"),
        max: z.number().optional().describe("The maximum number of documents (capped collections)"),
        validator: documentObject().optional().describe("A validator document (for example a $jsonSchema)"),
      })
      .optional()
      .describe("The options of the collection"),
  })
);
const createOutputSchema = zodAdapter<CreateOutput>(
  z.looseObject({
    acknowledged: z.boolean().describe("True when the server confirmed the write"),
    collectionName: z.string().describe("The name of the new collection"),
  })
);

export const createCollectionProcedure: Procedure<
  CreateInput,
  CreateOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "collections", "create"])
  .input(createInputSchema)
  .output(createOutputSchema)
  .meta({
    description: "Create a new collection",
    effects: { reads: ["mongo", "network"], writes: ["mongo", "network"], destructive: false },
  })
  .handler(async (input: CreateInput, ctx: ProcedureContext) => {
    const db = await databaseFor(input, ctx);

    // The schema leaves out an option that the input does not give: no option is undefined at run time
    await db.createCollection(input.name, input.options as CreateCollectionOptions | undefined);

    return {
      acknowledged: true,
      collectionName: input.name,
    };
  })
  .build();

export type { CreateInput, CreateOutput };
