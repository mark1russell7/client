/**
 * Procedure: mongo.collections.stats
 * Get collection statistics
 */

import { createProcedure, zodAdapter, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";
import type { CollectionStats } from "../types.js";

// Input/Output types
/** The input: only the scope fields. */
type StatsInput = ScopeInput;

// Schemas
const statsInputSchema = zodAdapter<StatsInput>(
  z.object({ ...scopeFields() })
);
const statsOutputSchema = zodAdapter<CollectionStats>(
  z.looseObject({
    count: z.number().describe("The number of documents"),
    size: z.number().describe("The size of the documents, in bytes"),
    avgObjSize: z.number().describe("The average size of a document, in bytes"),
    storageSize: z.number().describe("The storage size, in bytes"),
    nindexes: z.number().describe("The number of indexes"),
    totalIndexSize: z.number().describe("The size of the indexes, in bytes"),
  })
);

export const statsProcedure: Procedure<
  StatsInput,
  CollectionStats,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "collections", "stats"])
  .input(statsInputSchema)
  .output(statsOutputSchema)
  .meta({
    description: "Get collection statistics",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: StatsInput, ctx: ProcedureContext) => {
    const { db, name } = await collectionFor(input, ctx);
    // Use collStats command since stats() is deprecated
    const stats = await db.command({ collStats: name });

    return {
      count: (stats["count"] as number) ?? 0,
      size: (stats["size"] as number) ?? 0,
      avgObjSize: (stats["avgObjSize"] as number) ?? 0,
      storageSize: (stats["storageSize"] as number) ?? 0,
      nindexes: (stats["nindexes"] as number) ?? 0,
      totalIndexSize: (stats["totalIndexSize"] as number) ?? 0,
    };
  })
  .build();

export type { StatsInput };
export type StatsOutput = CollectionStats;
