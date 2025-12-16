/**
 * Procedure: mongo.collections.stats
 * Get collection statistics
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, type CollectionStats } from "../types.js";

// Input/Output types
interface StatsInput {
  [key: string]: never;
}

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
  .handler(async (_input: StatsInput, ctx: ProcedureContext) => {
    const meta = requireCollection(ctx.metadata);

    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    // Use collStats command since stats() is deprecated
    const stats = await db.command({ collStats: meta.collection });

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
