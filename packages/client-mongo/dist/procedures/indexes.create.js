/**
 * Procedure: mongo.indexes.create
 * Create an index on a collection
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const createIndexInputSchema = schema();
const createIndexOutputSchema = schema();
export const createIndexProcedure = createProcedure()
    .path(["mongo", "indexes", "create"])
    .input(createIndexInputSchema)
    .output(createIndexOutputSchema)
    .meta({ description: "Create an index on a collection" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const indexName = await collection.createIndex(input.keys, input.options);
    return {
        acknowledged: true,
        indexName,
    };
})
    .build();
//# sourceMappingURL=indexes.create.js.map