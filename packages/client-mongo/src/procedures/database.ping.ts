/**
 * Procedure: mongo.database.ping
 * Health check and connectivity test
 */

import { createProcedure, type Procedure, type ProcedureContext } from "@mark1russell7/client";
import { databaseFor, type ScopeInput } from "../scope.js";
import { schema } from "./schema.js";

// Input/Output types
/** The input: only the scope fields. */
type PingInput = ScopeInput;

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
  .handler(async (input: PingInput, ctx: ProcedureContext) => {
    const db = await databaseFor(input, ctx);

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
