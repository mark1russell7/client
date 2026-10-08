/**
 * Procedure: mongo.collections.stats
 * Get collection statistics
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const statsInputSchema = schema();
const statsOutputSchema = schema();
export const statsProcedure = createProcedure()
    .path(["mongo", "collections", "stats"])
    .input(statsInputSchema)
    .output(statsOutputSchema)
    .meta({ description: "Get collection statistics" })
    .handler(async (_input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    // Use collStats command since stats() is deprecated
    const stats = await db.command({ collStats: meta.collection });
    return {
        count: stats["count"] ?? 0,
        size: stats["size"] ?? 0,
        avgObjSize: stats["avgObjSize"] ?? 0,
        storageSize: stats["storageSize"] ?? 0,
        nindexes: stats["nindexes"] ?? 0,
        totalIndexSize: stats["totalIndexSize"] ?? 0,
    };
})
    .build();
//# sourceMappingURL=collections.stats.js.map