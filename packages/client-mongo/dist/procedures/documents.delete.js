/**
 * Procedure: mongo.documents.delete
 * Delete documents matching a filter
 */
import { createProcedure } from "client";
import { ObjectId } from "mongodb";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const deleteInputSchema = schema();
const deleteOutputSchema = schema();
/**
 * Parse ID to ObjectId if valid, otherwise return as string.
 * MongoDB supports any _id type at runtime.
 */
function parseId(id) {
    try {
        return new ObjectId(id);
    }
    catch {
        return id;
    }
}
/**
 * Build filter from id or filter input.
 * Uses Document type which accepts any _id via index signature.
 */
function buildFilter(input) {
    if (input.id) {
        return { _id: parseId(input.id) };
    }
    return input.filter ?? {};
}
export const deleteProcedure = createProcedure()
    .path(["mongo", "documents", "delete"])
    .input(deleteInputSchema)
    .output(deleteOutputSchema)
    .meta({ description: "Delete documents matching a filter" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const filter = buildFilter(input);
    if (input.multi) {
        const result = await collection.deleteMany(filter);
        return {
            acknowledged: result.acknowledged,
            deletedCount: result.deletedCount,
        };
    }
    const result = await collection.deleteOne(filter);
    return {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount,
    };
})
    .build();
//# sourceMappingURL=documents.delete.js.map