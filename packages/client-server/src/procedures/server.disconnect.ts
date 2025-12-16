/**
 * Procedure: server.disconnect
 * Disconnects from a remote peer
 */

import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ServerDisconnectInput, ServerDisconnectOutput } from "../types.js";
import { disconnect } from "../connection/index.js";

// Use pass-through schemas
const serverDisconnectInputSchema = schema<ServerDisconnectInput>();
const serverDisconnectOutputSchema = schema<ServerDisconnectOutput>();

export const serverDisconnectProcedure: Procedure<
  ServerDisconnectInput,
  ServerDisconnectOutput,
  { description: string }
> = createProcedure()
  .path(["server", "disconnect"])
  .input(serverDisconnectInputSchema)
  .output(serverDisconnectOutputSchema)
  .meta({ description: "Disconnect from a remote peer" })
  .handler(async (input: ServerDisconnectInput) => {
    const success = await disconnect(input.connectionId);
    return { success };
  })
  .build();

export type { ServerDisconnectInput, ServerDisconnectOutput };
