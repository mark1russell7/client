/**
 * Procedure: server.disconnect
 * Disconnects from a remote peer
 */

import { createProcedure, type Effects, type Procedure } from "@procedures/client";
import { wrapSchema } from "../schema.js";
import { ServerDisconnectOutputSchema } from "../output-schemas.js";
import { serverDisconnectInputSchema } from "../input-schemas.js";
import type { ServerDisconnectInput, ServerDisconnectOutput } from "../types.js";
import { disconnect } from "../connection/index.js";

// Use pass-through schemas
const serverDisconnectOutputSchema = wrapSchema<ServerDisconnectOutput>(ServerDisconnectOutputSchema);

export const serverDisconnectProcedure: Procedure<
  ServerDisconnectInput,
  ServerDisconnectOutput,
  { description: string; effects: Effects }
> = createProcedure()
  .path(["server", "disconnect"])
  .input(serverDisconnectInputSchema)
  .output(serverDisconnectOutputSchema)
  .meta({
    description: "Disconnect from a remote peer",
    effects: { reads: ["network"], writes: ["network"], idempotent: true },
    args: ["connectionId"],
  })
  .handler(async (input: ServerDisconnectInput) => {
    const success = await disconnect(input.connectionId);
    return { success };
  })
  .build();

export type { ServerDisconnectInput, ServerDisconnectOutput };
