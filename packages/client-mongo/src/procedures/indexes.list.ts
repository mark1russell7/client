/**
 * Procedure: mongo.indexes.list
 * List indexes on a collection
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";
import { type IndexInfo } from "../types.js";

// Input/Output types
/** The input: only the scope fields. */
type ListIndexesInput = ScopeInput;

interface ListIndexesOutput {
  indexes: IndexInfo[];
}

// Schemas
const listIndexesInputSchema: z.ZodType<ListIndexesInput> = z.object({ ...scopeFields() });
const listIndexesOutputSchema: z.ZodType<ListIndexesOutput> = z.looseObject({
    indexes: z
      .array(
        z.looseObject({
          name: z.string().describe("The index name"),
          key: z.record(z.string(), z.union([z.number(), z.string()])).describe("The fields of the index and their kind (1, -1, \"text\", \"hashed\")"),
          unique: z.boolean().optional().describe("True for a unique index"),
          sparse: z.boolean().optional().describe("True for a sparse index"),
        })
      )
      .describe("The indexes of the collection"),
  });

export const listIndexesProcedure: Procedure<
  ListIndexesInput,
  ListIndexesOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "indexes", "list"])
  .input(listIndexesInputSchema)
  .output(listIndexesOutputSchema)
  .meta({
    description: "List indexes on a collection",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: ListIndexesInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);

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
