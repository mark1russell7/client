/**
 * Procedure: mongo.documents.delete
 * Delete documents matching a filter
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor } from "../scope.js";
import { described, scopeFields, targetFields } from "./input-schemas.js";
import { z } from "zod";
import { parseTarget, targetFilter, type TargetInput } from "./target.js";

// Input/Output types
/** The input: exactly one of `id` or `filter`, and the scope fields. */
type DeleteInput = TargetInput;

interface DeleteOutput {
  acknowledged: boolean;
  deletedCount: number;
}

// Schemas
const deleteInputSchema = described<DeleteInput>(
  (data: unknown) => parseTarget("mongo.documents.delete", data).target,
  z.object({ ...scopeFields(), ...targetFields() })
);
const deleteOutputSchema: z.ZodType<DeleteOutput> = z.looseObject({
    acknowledged: z.boolean().describe("True when the server confirmed the write"),
    deletedCount: z.number().describe("The number of deleted documents"),
  });

export const deleteProcedure: Procedure<
  DeleteInput,
  DeleteOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "delete"])
  .input(deleteInputSchema)
  .output(deleteOutputSchema)
  .meta({
    description: "Delete documents matching a filter",
    effects: { reads: ["mongo", "network"], writes: ["mongo", "network"] },
  })
  .handler(async (input: DeleteInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);
    const filter = targetFilter(input);

    const result = input.multi ? await collection.deleteMany(filter) : await collection.deleteOne(filter);
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount,
    };
  })
  .build();

export type { DeleteInput, DeleteOutput };
