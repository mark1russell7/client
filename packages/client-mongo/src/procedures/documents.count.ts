/**
 * Procedure: mongo.documents.count
 * Count documents matching a filter
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
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
const countInputSchema: z.ZodType<CountInput> = z.object({
    ...scopeFields(),
    query: documentObject().optional().describe("The filter of the documents to count (default: all documents)"),
  });
const countOutputSchema: z.ZodType<CountOutput> = z.looseObject({
    count: z.number().describe("The number of documents that match"),
  });

export const countProcedure: Procedure<
  CountInput,
  CountOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "count"])
  .input(countInputSchema)
  .output(countOutputSchema)
  .meta({
    description: "Count documents matching a filter",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: CountInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);

    const count = await collection.countDocuments(input.query ?? {});

    return { count };
  })
  .build();

export type { CountInput, CountOutput };
