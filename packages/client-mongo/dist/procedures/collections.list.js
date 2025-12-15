/**
 * Procedure: mongo.collections.list
 * List all collections in the database
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta } from "../types.js";
// Schemas
const listInputSchema = schema();
const listOutputSchema = schema();
export const listProcedure = createProcedure()
    .path(["mongo", "collections", "list"])
    .input(listInputSchema)
    .output(listOutputSchema)
    .meta({ description: "List all collections in the database" })
    .handler(async (_input, ctx) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collections = await db.listCollections().toArray();
    const collectionNames = collections
        .filter((c) => c.type === "collection")
        .map((c) => c.name)
        .sort();
    return {
        collections: collectionNames,
    };
})
    .build();
//# sourceMappingURL=collections.list.js.map