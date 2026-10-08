/**
 * Procedure: mongo.documents.count
 * Count documents matching a filter
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const countInputSchema = schema();
const countOutputSchema = schema();
export const countProcedure = createProcedure()
    .path(["mongo", "documents", "count"])
    .input(countInputSchema)
    .output(countOutputSchema)
    .meta({ description: "Count documents matching a filter" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const count = await collection.countDocuments(input.query ?? {});
    return { count };
})
    .build();
//# sourceMappingURL=documents.count.js.map