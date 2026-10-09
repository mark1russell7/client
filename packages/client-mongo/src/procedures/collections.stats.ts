/**
 * Procedure: mongo.collections.stats
 * Get collection statistics
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { collectionFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";
import type { CollectionStats } from "../types.js";

// Input/Output types
/** The input: only the scope fields. */
type StatsInput = ScopeInput;

// Schemas
const statsInputSchema = schema<StatsInput>();
const statsOutputSchema = schema<CollectionStats>();

export const statsProcedure: Procedure<
  StatsInput,
  CollectionStats,
  { description: string }
> = createProcedure()
  .path(["mongo", "collections", "stats"])
  .input(statsInputSchema)
  .output(statsOutputSchema)
  .meta({ description: "Get collection statistics" })
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
