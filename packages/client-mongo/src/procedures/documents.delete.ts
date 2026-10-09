/**
 * Procedure: mongo.documents.delete
 * Delete documents matching a filter
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor } from "../scope.js";
import { schema } from "./schema.js";
import { parseTarget, targetFilter, type TargetInput } from "./target.js";

// Input/Output types
/** The input: exactly one of `id` or `filter`, and the scope fields. */
type DeleteInput = TargetInput;

interface DeleteOutput {
  acknowledged: boolean;
  deletedCount: number;
}

// Schemas
const deleteInputSchema = zodAdapter<DeleteInput>({
  parse: (data: unknown) => parseTarget("mongo.documents.delete", data).target,
});
const deleteOutputSchema = schema<DeleteOutput>();

export const deleteProcedure: Procedure<
  DeleteInput,
  DeleteOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "delete"])
  .input(deleteInputSchema)
  .output(deleteOutputSchema)
  .meta({ description: "Delete documents matching a filter" })
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
