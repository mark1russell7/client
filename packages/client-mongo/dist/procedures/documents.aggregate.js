/**
 * Procedure: mongo.documents.aggregate
 * Run an aggregation pipeline
 */
import { createProcedure } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, } from "../types.js";
// Schemas
const aggregateInputSchema = schema();
const aggregateOutputSchema = schema();
export const aggregateProcedure = createProcedure()
    .path(["mongo", "documents", "aggregate"])
    .input(aggregateInputSchema)
    .output(aggregateOutputSchema)
    .meta({ description: "Run an aggregation pipeline" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const results = await collection
        .aggregate(input.pipeline, input.options)
        .toArray();
    return { results };
})
    .build();
//# sourceMappingURL=documents.aggregate.js.map