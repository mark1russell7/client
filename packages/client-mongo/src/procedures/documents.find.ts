/**
 * Procedure: mongo.documents.find
 * Find documents with pagination and filtering
 */

import { createProcedure, type Procedure, type ProcedureContext } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import {
  requireCollection,
  type PaginationOutput,
  type DocumentQuery,
  type SortSpec,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface FindInput {
  query?: DocumentQuery;
  projection?: Record<string, 0 | 1>;
  sort?: SortSpec;
  page?: number;
  limit?: number;
}

interface FindOutput {
  documents: MongoDocument[];
  pagination: PaginationOutput;
}

// Schemas
const findInputSchema = schema<FindInput>();
const findOutputSchema = schema<FindOutput>();

export const findProcedure: Procedure<
  FindInput,
  FindOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "documents", "find"])
  .input(findInputSchema)
  .output(findOutputSchema)
  .meta({ description: "Find documents with pagination and filtering" })
  .handler(async (input: FindInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);

    const query = input.query ?? {};
    const page = input.page ?? 1;
    const limit = Math.min(input.limit ?? 20, 100); // Cap at 100
    const skip = (page - 1) * limit;

    // Execute query and count in parallel
    const [documents, total] = await Promise.all([
      collection
        .find(query)
        .project(input.projection ?? {})
        .sort(input.sort ?? {})
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  })
  .build();

export type { FindInput, FindOutput };
