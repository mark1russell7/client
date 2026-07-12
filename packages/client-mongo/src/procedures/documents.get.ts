/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import {
  requireCollection,
  buildIdFilter,
  type IdType,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface GetInput {
  id: string;
  /** How to interpret the id (default: "auto" — matches ObjectId or string) */
  idType?: IdType;
}

interface GetOutput {
  document: MongoDocument | null;
}

// Schemas
const getInputSchema = schema<GetInput>();
const getOutputSchema = schema<GetOutput>();

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

    const document = await collection.findOne(
      buildIdFilter(input.id, input.idType)
    );

    return { document };
  })
  .build();

export type { GetInput, GetOutput };
