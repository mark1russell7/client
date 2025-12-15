/**
 * Procedure: mongo.documents.count
 * Count documents matching a filter
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, type DocumentQuery } from "../types.js";

// Input/Output types
interface CountInput {
  query?: DocumentQuery;
}

interface CountOutput {
  count: number;
}

// Schemas
const countInputSchema = schema<CountInput>();
const countOutputSchema = schema<CountOutput>();

export const countProcedure: Procedure<
  CountInput,
  CountOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "count"])
  .input(countInputSchema)
  .output(countOutputSchema)
  .meta({ description: "Count documents matching a filter" })
  .handler(async (input: CountInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    const count = await collection.countDocuments(input.query ?? {});

    return { count };
  })
  .build();

export type { CountInput, CountOutput };
