/**
 * Procedure: mongo.documents.find
 * Find documents with pagination and filtering
 */

import {
  createProcedure,
  type Effects,
  type Procedure,
  type ProcedureContext,
} from "@procedures/client";
import { collectionFor, copyScope, type ScopeInput } from "../scope.js";
import { described, documentObject, scopeFields } from "./input-schemas.js";
import { z } from "zod";
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
const findInputSchema = described<FindInput>(
  parseFindInput,
  z.object({
    ...scopeFields(),
    query: documentObject().optional().describe("The filter of the documents (default: all documents)"),
    projection: z.record(z.string(), z.union([z.literal(0), z.literal(1)])).optional().describe("The fields to give (1) or to leave out (0)"),
    sort: z.record(z.string(), z.unknown()).optional().describe("The sort order: { field: 1 } ascending, { field: -1 } descending"),
    page: z.number().int().min(1).optional().describe("The page to give, from 1"),
    limit: z.number().int().min(1).optional().describe("The number of documents on a page"),
  })
);
const findOutputSchema: z.ZodType<FindOutput> = z.looseObject({
    documents: z.array(z.record(z.string(), z.unknown())).describe("The documents of the page"),
    pagination: z.looseObject({
      page: z.number().describe("The page, from 1"),
      limit: z.number().describe("The number of documents on a page"),
      total: z.number().describe("The number of documents that match"),
      totalPages: z.number().describe("The number of pages"),
      hasNext: z.boolean().describe("True when a next page exists"),
      hasPrev: z.boolean().describe("True when a previous page exists"),
    }).describe("The page of the result"),
  });

export const findProcedure: Procedure<
  FindInput,
  FindOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "find"])
  .input(findInputSchema)
  .output(findOutputSchema)
  .meta({
    description: "Find documents with pagination and filtering",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
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
