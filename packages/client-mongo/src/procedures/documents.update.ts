/**
 * Procedure: mongo.documents.update
 * Update documents matching a filter
 */

import { createProcedure, zodAdapter, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor } from "../scope.js";
import { schema } from "./schema.js";
import type { DocumentUpdate } from "../types.js";
import { parseTarget, targetFilter, upsertFilter, type TargetInput } from "./target.js";

// Input/Output types
/** The input: exactly one of `id` or `filter`, the update, and the scope fields. */
interface UpdateInput extends TargetInput {
  /** Update operations */
  update: DocumentUpdate;
  /** Insert if not found */
  upsert?: boolean;
}

interface UpdateOutput {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId: string | null;
  upsertedCount: number;
}

function parseUpdateInput(data: unknown): UpdateInput {
  const procedure = "mongo.documents.update";
  const { target, raw } = parseTarget(procedure, data, ["update", "upsert"]);
  const update = raw["update"];
  if (typeof update !== "object" || update === null) {
    throw new Error(`${procedure}: update must be an object (or a pipeline array)`);
  }
  const result: UpdateInput = { ...target, update: update as DocumentUpdate };
  const upsert = raw["upsert"];
  if (upsert !== undefined) {
    if (typeof upsert !== "boolean") throw new Error(`${procedure}: upsert must be a boolean`);
    result.upsert = upsert;
  }
  return result;
}

// Schemas
const updateInputSchema = zodAdapter<UpdateInput>({ parse: parseUpdateInput });
const updateOutputSchema = schema<UpdateOutput>();

export const updateProcedure: Procedure<
  UpdateInput,
  UpdateOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "update"])
  .input(updateInputSchema)
  .output(updateOutputSchema)
  .meta({ description: "Update documents matching a filter" })
  .handler(async (input: UpdateInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);
    const upsert = input.upsert ?? false;
    const filter = upsert ? await upsertFilter(collection, input) : targetFilter(input);

    const result = input.multi
      ? await collection.updateMany(filter, input.update, { upsert })
      : await collection.updateOne(filter, input.update, { upsert });
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: result.upsertedId ? String(result.upsertedId) : null,
      upsertedCount: result.upsertedCount,
    };
  })
  .build();

export type { UpdateInput, UpdateOutput };
