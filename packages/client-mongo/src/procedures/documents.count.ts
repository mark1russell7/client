/**
 * Procedure: mongo.documents.count
 * Count documents matching a filter
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { scopeFields, documentObject } from "./input-schemas.js";
import { z } from "zod";
import { type DocumentQuery } from "../types.js";

// Input/Output types
interface CountInput extends ScopeInput {
  query?: DocumentQuery | undefined;
}

interface CountOutput {
  count: number;
}

// Schemas
const countInputSchema = zodAdapter<CountInput>(
  z.object({
    ...scopeFields(),
    query: documentObject().optional().describe("The filter of the documents to count (default: all documents)"),
  })
);
const countOutputSchema = zodAdapter<CountOutput>(
  z.looseObject({
    count: z.number().describe("The number of documents that match"),
  })
);

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
