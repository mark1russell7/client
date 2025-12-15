/**
 * Procedure: mongo.indexes.list
 * List indexes on a collection
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const listIndexesInputSchema = schema();
const listIndexesOutputSchema = schema();
export const listIndexesProcedure = createProcedure()
    .path(["mongo", "indexes", "list"])
    .input(listIndexesInputSchema)
    .output(listIndexesOutputSchema)
    .meta({ description: "List indexes on a collection" })
    .handler(async (_input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const indexes = await collection.listIndexes().toArray();
    return {
        indexes: indexes.map((idx) => ({
            name: idx.name,
            key: idx.key,
            unique: idx.unique,
            sparse: idx.sparse,
        })),
    };
})
    .build();
//# sourceMappingURL=indexes.list.js.map