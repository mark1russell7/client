/**
 * Procedure: mongo.documents.insert
 * Insert one or more documents
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { scopeFields, documentObject } from "./input-schemas.js";
import { z } from "zod";
import { type MongoDocument } from "../types.js";

// Input/Output types
interface InsertInput extends ScopeInput {
  /** Single document or array of documents */
  documents: MongoDocument | MongoDocument[];
}

interface InsertOutput {
  acknowledged: boolean;
  insertedIds: string[];
  insertedCount: number;
}

// Schemas
const insertInputSchema: z.ZodType<InsertInput> = z.object({
    ...scopeFields(),
    documents: z
      .union([documentObject(), z.array(documentObject())])
      .describe("One document, or a list of documents"),
  });
const insertOutputSchema: z.ZodType<InsertOutput> = z.looseObject({
    acknowledged: z.boolean().describe("True when the server confirmed the write"),
    insertedIds: z.array(z.string()).describe("The ids of the new documents, as text"),
    insertedCount: z.number().describe("The number of new documents"),
  });

export const insertProcedure: Procedure<
  InsertInput,
  InsertOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "insert"])
  .input(insertInputSchema)
  .output(insertOutputSchema)
  .meta({
    description: "Insert one or more documents",
    effects: { reads: ["mongo", "network"], writes: ["mongo", "network"], destructive: false },
  })
  .handler(async (input: InsertInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);

    const docs = Array.isArray(input.documents)
      ? input.documents
      : [input.documents];

    if (docs.length === 0) {
      return {
        acknowledged: true,
        insertedIds: [],
        insertedCount: 0,
      };
    }

    if (docs.length === 1) {
      const result = await collection.insertOne(docs[0]!);
      return {
        acknowledged: result.acknowledged,
        insertedIds: [String(result.insertedId)],
        insertedCount: result.acknowledged ? 1 : 0,
      };
    }

    const result = await collection.insertMany(docs);
    return {
      acknowledged: result.acknowledged,
      insertedIds: Object.values(result.insertedIds).map(String),
      insertedCount: result.insertedCount,
    };
  })
  .build();

export type { InsertInput, InsertOutput };
