/**
 * Procedure: mongo.database.ping
 * Health check and connectivity test
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { getDb } from "../connection.js";
import { schema } from "./schema.js";
import { getBaseMeta } from "../types.js";

// Input/Output types
interface PingInput {
  [key: string]: never;
}

interface PingOutput {
  ok: boolean;
  latencyMs: number;
}

// Schemas
const pingInputSchema = schema<PingInput>();
const pingOutputSchema = schema<PingOutput>();

export const pingProcedure: Procedure<
  PingInput,
  PingOutput,
  { description: string }
> = createProcedure()
  .path(["mongo", "database", "ping"])
  .input(pingInputSchema)
  .output(pingOutputSchema)
  .meta({ description: "Health check and connectivity test" })
  .handler(async (_input: PingInput, ctx: ProcedureContext) => {
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

export type { PingInput, PingOutput };
