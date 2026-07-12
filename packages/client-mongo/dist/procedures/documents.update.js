/**
 * Procedure: mongo.documents.update
 * Update documents matching a filter
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, buildIdFilter, } from "../types.js";
// Schemas
const updateInputSchema = schema();
const updateOutputSchema = schema();
/**
 * Build filter from id or filter input.
 * Uses Document type which accepts any _id via index signature.
 */
function buildFilter(input) {
    if (input.id) {
        return buildIdFilter(input.id, input.idType);
    }
    return input.filter ?? {};
}
export const updateProcedure = createProcedure()
    .path(["mongo", "documents", "update"])
    .input(updateInputSchema)
    .output(updateOutputSchema)
    .meta({ description: "Update documents matching a filter" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const filter = buildFilter(input);
    if (input.multi) {
        const result = await collection.updateMany(filter, input.update, {
            upsert: input.upsert ?? false,
        });
        return {
            acknowledged: result.acknowledged,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId ? String(result.upsertedId) : null,
            upsertedCount: result.upsertedCount,
        };
    }
    const result = await collection.updateOne(filter, input.update, {
        upsert: input.upsert ?? false,
    });
    return {
        acknowledged: result.acknowledged,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : null,
        upsertedCount: result.upsertedCount,
    };
})
    .build();
//# sourceMappingURL=documents.update.js.map