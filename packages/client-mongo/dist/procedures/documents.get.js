/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, buildIdFilter, } from "../types.js";
// Schemas
const getInputSchema = schema();
const getOutputSchema = schema();
export const getProcedure = createProcedure()
    .path(["mongo", "documents", "get"])
    .input(getInputSchema)
    .output(getOutputSchema)
    .meta({ description: "Get a single document by ID" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const document = await collection.findOne(buildIdFilter(input.id, input.idType));
    return { document };
})
    .build();
//# sourceMappingURL=documents.get.js.map