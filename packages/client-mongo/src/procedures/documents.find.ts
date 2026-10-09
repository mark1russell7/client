/**
 * Procedure: mongo.documents.find
 * Find documents with pagination and filtering
 */

import {
  createProcedure,
  zodAdapter,
  type Procedure,
  type ProcedureContext,
} from "@mark1russell7/client";
import { collectionFor, copyScope, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import {
  type PaginationOutput,
  type DocumentQuery,
  type SortSpec,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface FindInput extends ScopeInput {
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

/**
 * Validate find input. Enforces `page`/`limit` as integers >= 1 so a `page: 0`
 * (which produced a negative `skip`) or a string `limit` (which produced a
 * `NaN` limit) can no longer reach the driver. Other fields pass through.
 */
function parseFindInput(data: unknown): FindInput {
  if (typeof data !== "object" || data === null) {
    throw new Error("mongo.documents.find: input must be an object");
  }
  const raw = data as Record<string, unknown>;
  const result: FindInput = {};
  copyScope(raw, result);

  if (raw["query"] !== undefined) {
    result.query = raw["query"] as DocumentQuery;
  }
  if (raw["projection"] !== undefined) {
    result.projection = raw["projection"] as Record<string, 0 | 1>;
  }
  if (raw["sort"] !== undefined) {
    result.sort = raw["sort"] as SortSpec;
  }
  if (raw["page"] !== undefined) {
    const page = raw["page"];
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
      throw new Error("mongo.documents.find: page must be an integer >= 1");
    }
    result.page = page;
  }
  if (raw["limit"] !== undefined) {
    const limit = raw["limit"];
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
      throw new Error("mongo.documents.find: limit must be an integer >= 1");
    }
    result.limit = limit;
  }

  return result;
}

// Schemas
const findInputSchema = zodAdapter<FindInput>({ parse: parseFindInput });
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
    const { collection } = await collectionFor(input, ctx);

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
