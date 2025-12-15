/**
 * Procedure: mongo.documents.insert
 * Insert one or more documents
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const insertInputSchema = schema();
const insertOutputSchema = schema();
export const insertProcedure = createProcedure()
    .path(["mongo", "documents", "insert"])
    .input(insertInputSchema)
    .output(insertOutputSchema)
    .meta({ description: "Insert one or more documents" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const docs = Array.isArray(input.documents)
        ? input.documents
        : [input.documents];
    if (docs.length === 0) {
        return {
            acknowledged: true,
            insertedIds: [],
            insertedCount: 0,
        };
    }
    if (docs.length === 1) {
        const result = await collection.insertOne(docs[0]);
        return {
            acknowledged: result.acknowledged,
            insertedIds: [String(result.insertedId)],
            insertedCount: result.acknowledged ? 1 : 0,
        };
    }
    const result = await collection.insertMany(docs);
    return {
        acknowledged: result.acknowledged,
        insertedIds: Object.values(result.insertedIds).map(String),
        insertedCount: result.insertedCount,
    };
})
    .build();
//# sourceMappingURL=documents.insert.js.map