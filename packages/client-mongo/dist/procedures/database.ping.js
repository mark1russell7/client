/**
 * Procedure: mongo.database.ping
 * Health check and connectivity test
 */
import { createProcedure } from "client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta } from "../types.js";
// Schemas
const pingInputSchema = schema();
const pingOutputSchema = schema();
export const pingProcedure = createProcedure()
    .path(["mongo", "database", "ping"])
    .input(pingInputSchema)
    .output(pingOutputSchema)
    .meta({ description: "Health check and connectivity test" })
    .handler(async (_input, ctx) => {
    const meta = getBaseMeta(ctx.metadata);
    const db = meta.database ? getDb().client.db(meta.database) : getDb();
    const start = Date.now();
    await db.command({ ping: 1 });
    const latencyMs = Date.now() - start;
    return {
        ok: true,
        latencyMs,
    };
})
    .build();
//# sourceMappingURL=database.ping.js.map