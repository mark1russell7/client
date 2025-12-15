/**
 * Procedure: mongo.collections.drop
 * Drop (delete) a collection
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const dropInputSchema = schema();
const dropOutputSchema = schema();
export const dropProcedure = createProcedure()
    .path(["mongo", "collections", "drop"])
    .input(dropInputSchema)
    .output(dropOutputSchema)
    .meta({ description: "Drop (delete) a collection" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    if (!input.confirm) {
        throw new Error("confirm must be true to drop a collection");
    }
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const dropped = await db.dropCollection(meta.collection);
    return {
        acknowledged: true,
        dropped,
    };
})
    .build();
//# sourceMappingURL=collections.drop.js.map