/**
 * Procedure: mongo.documents.update
 * Update documents matching a filter
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext, zodAdapter } from "@procedures/client";
import { collectionFor } from "../scope.js";
import { described, documentObject, scopeFields, targetFields } from "./input-schemas.js";
import { z } from "zod";
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
const updateInputSchema = described<UpdateInput>(
  parseUpdateInput,
  z.object({
    ...scopeFields(),
    ...targetFields(),
    update: documentObject().describe("The update operations, for example { $set: { status: \"done\" } }"),
    upsert: z.boolean().optional().describe("Insert a document when none matches"),
  })
);
const updateOutputSchema = zodAdapter<UpdateOutput>(
  z.looseObject({
    acknowledged: z.boolean().describe("True when the server confirmed the write"),
    matchedCount: z.number().describe("The number of documents that matched"),
    modifiedCount: z.number().describe("The number of documents that changed"),
    upsertedId: z.string().nullable().describe("The id of the new document of an upsert, as text, or null"),
    upsertedCount: z.number().describe("The number of documents that an upsert made"),
  })
);

export const updateProcedure: Procedure<
  UpdateInput,
  UpdateOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "update"])
  .input(updateInputSchema)
  .output(updateOutputSchema)
  .meta({
    description: "Update documents matching a filter",
    effects: { reads: ["mongo", "network"], writes: ["mongo", "network"] },
  })
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
