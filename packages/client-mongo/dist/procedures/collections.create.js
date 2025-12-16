/**
 * Procedure: mongo.collections.create
 * Create a new collection
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta } from "../types.js";
// Schemas
const createInputSchema = schema();
const createOutputSchema = schema();
export const createCollectionProcedure = createProcedure()
    .path(["mongo", "collections", "create"])
    .input(createInputSchema)
    .output(createOutputSchema)
    .meta({ description: "Create a new collection" })
    .handler(async (input, ctx) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    await db.createCollection(input.name, input.options);
    return {
        acknowledged: true,
        collectionName: input.name,
    };
})
    .build();
//# sourceMappingURL=collections.create.js.map