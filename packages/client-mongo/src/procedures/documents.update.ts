/**
 * Procedure: mongo.documents.update
 * Update documents matching a filter
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import {
  requireCollection,
  type DocumentQuery,
  type DocumentUpdate,
} from "../types.js";

// Input/Output types
interface UpdateInput {
  /** Filter to match documents (or id for single document) */
  filter?: DocumentQuery;
  /** Document ID (alternative to filter for single document) */
  id?: string;
  /** Update operations */
  update: DocumentUpdate;
  /** Insert if not found */
  upsert?: boolean;
  /** Update all matching documents */
  multi?: boolean;
}

interface UpdateOutput {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId: string | null;
  upsertedCount: number;
}

// Schemas
const updateInputSchema = schema<UpdateInput>();
const updateOutputSchema = schema<UpdateOutput>();

/**
 * Parse ID to ObjectId if valid, otherwise return as string.
 * MongoDB supports any _id type at runtime.
 */
function parseId(id: string): ObjectId | string {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

/**
 * Build filter from id or filter input.
 * Uses Document type which accepts any _id via index signature.
 */
function buildFilter(input: UpdateInput): Document {
  if (input.id) {
    return { _id: parseId(input.id) };
  }
  return input.filter ?? {};
}

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
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const filter = buildFilter(input);

    if (input.multi) {
      const result = await collection.updateMany(filter, input.update, {
        upsert: input.upsert ?? false,
      });
      return {
        acknowledged: result.acknowledged,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : null,
        upsertedCount: result.upsertedCount,
      };
    }

    const result = await collection.updateOne(filter, input.update, {
      upsert: input.upsert ?? false,
    });
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
