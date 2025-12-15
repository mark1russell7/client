/**
 * Procedure: mongo.indexes.drop
 * Drop an index from a collection
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const dropIndexInputSchema = schema();
const dropIndexOutputSchema = schema();
export const dropIndexProcedure = createProcedure()
    .path(["mongo", "indexes", "drop"])
    .input(dropIndexInputSchema)
    .output(dropIndexOutputSchema)
    .meta({ description: "Drop an index from a collection" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    await collection.dropIndex(input.indexName);
    return {
        acknowledged: true,
    };
})
    .build();
//# sourceMappingURL=indexes.drop.js.map