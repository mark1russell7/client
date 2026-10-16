/**
 * Procedure: mongo.documents.distinct (roadmap R44)
 * The distinct values of one field in the documents that match a filter
 */

import { createProcedure, zodAdapter, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { scopeFields, documentObject } from "./input-schemas.js";
import { z } from "zod";
import { type DocumentQuery } from "../types.js";

// Input/Output types
interface DistinctInput extends ScopeInput {
  /** The field, with dots for an embedded field ("address.city") */
  field: string;
  /** The filter of the documents (default: all documents) */
  query?: DocumentQuery | undefined;
}

interface DistinctOutput {
  values: unknown[];
}

// Schemas
const distinctInputSchema = zodAdapter<DistinctInput>(
  z.object({
    ...scopeFields(),
    field: z.string().min(1).describe('The field, with dots for an embedded field (for example "address.city")'),
    query: documentObject().optional().describe("The filter of the documents (default: all documents)"),
  })
);
const distinctOutputSchema = zodAdapter<DistinctOutput>(
  z.looseObject({
    values: z.array(z.unknown()).describe("The distinct values of the field. An array field gives each of its elements."),
  })
);

export const distinctProcedure: Procedure<
  DistinctInput,
  DistinctOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "distinct"])
  .input(distinctInputSchema)
  .output(distinctOutputSchema)
  .meta({
    description: "The distinct values of a field in the documents that match a filter",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: DistinctInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);
    const values = await collection.distinct(input.field, input.query ?? {});
    return { values };
  })
  .build();

export type { DistinctInput, DistinctOutput };
