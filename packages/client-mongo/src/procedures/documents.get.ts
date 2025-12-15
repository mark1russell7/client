/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, type MongoDocument } from "../types.js";

// Input/Output types
interface GetInput {
  id: string;
}

interface GetOutput {
  document: MongoDocument | null;
}

// Schemas
const getInputSchema = schema<GetInput>();
const getOutputSchema = schema<GetOutput>();

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
 * Build _id filter using Document's index signature.
 */
function buildIdFilter(id: string): Document {
  return { _id: parseId(id) };
}

export const getProcedure: Procedure<
  GetInput,
  GetOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "get"])
  .input(getInputSchema)
  .output(getOutputSchema)
  .meta({ description: "Get a single document by ID" })
  .handler(async (input: GetInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    const document = await collection.findOne(buildIdFilter(input.id));

    return { document };
  })
  .build();

export type { GetInput, GetOutput };
