/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */
import { createProcedure } from "@mark1russell7/client";
import { ObjectId } from "mongodb";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection } from "../types.js";
// Schemas
const getInputSchema = schema();
const getOutputSchema = schema();
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
 * Build _id filter using Document's index signature.
 */
function buildIdFilter(id) {
    return { _id: parseId(id) };
}
export const getProcedure = createProcedure()
    .path(["mongo", "documents", "get"])
    .input(getInputSchema)
    .output(getOutputSchema)
    .meta({ description: "Get a single document by ID" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const document = await collection.findOne(buildIdFilter(input.id));
    return { document };
})
    .build();
//# sourceMappingURL=documents.get.js.map