/**
 * Procedure: mongo.documents.count
 * Count documents matching a filter
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import { type DocumentQuery } from "../types.js";

// Input/Output types
interface CountInput extends ScopeInput {
  query?: DocumentQuery;
}

interface CountOutput {
  count: number;
}

// Schemas
const countInputSchema = schema<CountInput>();
const countOutputSchema = schema<CountOutput>();

export const countProcedure: Procedure<
  CountInput,
  CountOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "count"])
  .input(countInputSchema)
  .output(countOutputSchema)
  .meta({ description: "Count documents matching a filter" })
  .handler(async (input: CountInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);

    const count = await collection.countDocuments(input.query ?? {});

    return { count };
  })
  .build();

export type { CountInput, CountOutput };
