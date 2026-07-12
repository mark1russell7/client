/**
 * Procedure: mongo.documents.find
 * Find documents with pagination and filtering
 */
import { createProcedure, zodAdapter, } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { requireCollection, } from "../types.js";
/**
 * Validate find input. Enforces `page`/`limit` as integers >= 1 so a `page: 0`
 * (which produced a negative `skip`) or a string `limit` (which produced a
 * `NaN` limit) can no longer reach the driver. Other fields pass through.
 */
function parseFindInput(data) {
    if (typeof data !== "object" || data === null) {
        throw new Error("mongo.documents.find: input must be an object");
    }
    const raw = data;
    const result = {};
    if (raw["query"] !== undefined) {
        result.query = raw["query"];
    }
    if (raw["projection"] !== undefined) {
        result.projection = raw["projection"];
    }
    if (raw["sort"] !== undefined) {
        result.sort = raw["sort"];
    }
    if (raw["page"] !== undefined) {
        const page = raw["page"];
        if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
            throw new Error("mongo.documents.find: page must be an integer >= 1");
        }
        result.page = page;
    }
    if (raw["limit"] !== undefined) {
        const limit = raw["limit"];
        if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
            throw new Error("mongo.documents.find: limit must be an integer >= 1");
        }
        result.limit = limit;
    }
    return result;
}
// Schemas
const findInputSchema = zodAdapter({ parse: parseFindInput });
const findOutputSchema = schema();
export const findProcedure = createProcedure()
    .path(["mongo", "documents", "find"])
    .input(findInputSchema)
    .output(findOutputSchema)
    .meta({ description: "Find documents with pagination and filtering" })
    .handler(async (input, ctx) => {
    const meta = requireCollection(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const collection = db.collection(meta.collection);
    const query = input.query ?? {};
    const page = input.page ?? 1;
    const limit = Math.min(input.limit ?? 20, 100); // Cap at 100
    const skip = (page - 1) * limit;
    // Execute query and count in parallel
    const [documents, total] = await Promise.all([
        collection
            .find(query)
            .project(input.projection ?? {})
            .sort(input.sort ?? {})
            .skip(skip)
            .limit(limit)
            .toArray(),
        collection.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
        documents,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    };
})
    .build();
//# sourceMappingURL=documents.find.js.map