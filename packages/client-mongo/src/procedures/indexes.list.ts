/**
 * Procedure: mongo.indexes.list
 * List indexes on a collection
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import { type IndexInfo } from "../types.js";

// Input/Output types
/** The input: only the scope fields. */
type ListIndexesInput = ScopeInput;

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
