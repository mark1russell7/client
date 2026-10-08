/**
 * Procedure: server.connect
 * Connects to a remote peer for bidirectional RPC
 */

import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ServerConnectInput, ServerConnectOutput } from "../types.js";
import { connect } from "../connection/index.js";

// Use pass-through schemas
const serverConnectInputSchema = schema<ServerConnectInput>();
const serverConnectOutputSchema = schema<ServerConnectOutput>();

export const serverConnectProcedure: Procedure<
  ServerConnectInput,
  ServerConnectOutput,
  { description: string }
> = createProcedure()
  .path(["server", "connect"])
  .input(serverConnectInputSchema)
  .output(serverConnectOutputSchema)
  .meta({ description: "Connect to a remote peer for bidirectional RPC" })
  .handler(async (input: ServerConnectInput) => {
    const connectOptions: Parameters<typeof connect>[0] = {
      address: input.address,
    };
    if (input.transport !== undefined) {
      connectOptions.transport = input.transport;
    }
    if (input.timeout !== undefined) {
      connectOptions.timeout = input.timeout;
    }
    const connection = await connect(connectOptions);

    return {
      connectionId: connection.id,
      remotePeerId: connection.remote.remotePeerId,
      remoteProcedures: connection.remote.remoteProcedures,
    };
  })
  .build();

export type { ServerConnectInput, ServerConnectOutput };
