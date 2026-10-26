/**
 * Procedure: mongo.database.ping
 * Health check and connectivity test
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { databaseFor, type ScopeInput } from "../scope.js";
import { scopeFields } from "./input-schemas.js";
import { z } from "zod";

// Input/Output types
/** The input: only the scope fields. */
type PingInput = ScopeInput;

interface PingOutput {
  ok: boolean;
  latencyMs: number;
}

// Schemas
const pingInputSchema: z.ZodType<PingInput> = z.object({ ...scopeFields() });
const pingOutputSchema: z.ZodType<PingOutput> = z.looseObject({
    ok: z.boolean().describe("True when the server answered"),
    latencyMs: z.number().describe("The time of the ping, in milliseconds"),
  });

export const pingProcedure: Procedure<
  PingInput,
  PingOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "database", "ping"])
  .input(pingInputSchema)
  .output(pingOutputSchema)
  .meta({
    description: "Health check and connectivity test",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
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
