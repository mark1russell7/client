/**
 * Procedure: mongo.database.info
 * Get database information and statistics
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta } from "../types.js";
// Schemas
const infoInputSchema = schema();
const infoOutputSchema = schema();
export const infoProcedure = createProcedure()
    .path(["mongo", "database", "info"])
    .input(infoInputSchema)
    .output(infoOutputSchema)
    .meta({ description: "Get database information and statistics" })
    .handler(async (_input, ctx) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const stats = await db.stats();
    const collections = await db.listCollections().toArray();
    const views = collections.filter((c) => c.type === "view").length;
    return {
        name: db.databaseName,
        collections: collections.length - views,
        views,
        sizeOnDisk: stats["dataSize"] ?? 0,
        empty: collections.length === 0,
    };
})
    .build();
//# sourceMappingURL=database.info.js.map