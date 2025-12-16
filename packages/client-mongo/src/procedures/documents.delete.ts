/**
 * Procedure: mongo.documents.delete
 * Delete documents matching a filter
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, type DocumentQuery } from "../types.js";

// Input/Output types
interface DeleteInput {
  /** Filter to match documents (or id for single document) */
  filter?: DocumentQuery;
  /** Document ID (alternative to filter for single document) */
  id?: string;
  /** Delete all matching documents */
  multi?: boolean;
}

interface DeleteOutput {
  acknowledged: boolean;
  deletedCount: number;
}

// Schemas
const deleteInputSchema = schema<DeleteInput>();
const deleteOutputSchema = schema<DeleteOutput>();

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
function buildFilter(input: DeleteInput): Document {
  if (input.id) {
    return { _id: parseId(input.id) };
  }
  return input.filter ?? {};
}

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
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const filter = buildFilter(input);

    if (input.multi) {
      const result = await collection.deleteMany(filter);
      return {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount,
      };
    }

    const result = await collection.deleteOne(filter);
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount,
    };
  })
  .build();

export type { DeleteInput, DeleteOutput };
