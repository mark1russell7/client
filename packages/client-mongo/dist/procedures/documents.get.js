/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */
import { createProcedure, zodAdapter, } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, buildIdFilter, } from "../types.js";
/**
 * Validate get input: `id` must be a non-empty string, and `idType`, when
 * present, must be one of the supported modes.
 */
function parseGetInput(data) {
    if (typeof data !== "object" || data === null) {
        throw new Error("mongo.documents.get: input must be an object");
    }
    const raw = data;
    const id = raw["id"];
    if (typeof id !== "string" || id.length === 0) {
        throw new Error("mongo.documents.get: id must be a non-empty string");
    }
    const result = { id };
    const idType = raw["idType"];
    if (idType !== undefined) {
        if (idType !== "auto" && idType !== "objectId" && idType !== "string") {
            throw new Error('mongo.documents.get: idType must be "auto", "objectId", or "string"');
        }
        result.idType = idType;
    }
    return result;
}
// Schemas
const getInputSchema = zodAdapter({ parse: parseGetInput });
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