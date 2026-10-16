/**
 * Procedure: server.connect
 * Connects to a remote peer for bidirectional RPC
 */

import { createProcedure, type Effects, type Procedure } from "@procedures/client";
import { wrapSchema } from "../schema.js";
import { ServerConnectOutputSchema } from "../output-schemas.js";
import { serverConnectInputSchema } from "../input-schemas.js";
import type { ServerConnectInput, ServerConnectOutput } from "../types.js";
import { connect } from "../connection/index.js";
import { ms } from "@procedures/client";

// Use pass-through schemas
const serverConnectOutputSchema = wrapSchema<ServerConnectOutput>(ServerConnectOutputSchema);

export const serverConnectProcedure: Procedure<
  ServerConnectInput,
  ServerConnectOutput,
  { description: string; effects: Effects }
> = createProcedure()
  .path(["server", "connect"])
  .input(serverConnectInputSchema)
  .output(serverConnectOutputSchema)
  .meta({
    description: "Connect to a remote peer for bidirectional RPC",
    // It opens a new connection to a remote peer and reads the procedures of that peer
    effects: { reads: ["network"], writes: ["network"], destructive: false },
    args: ["address"],
  })
  .handler(async (input: ServerConnectInput) => {
    const connectOptions: Parameters<typeof connect>[0] = {
      address: input.address,
    };
    if (input.transport !== undefined) {
      connectOptions.transport = input.transport;
    }
    if (input.timeout !== undefined) {
      // The input is data: a number of milliseconds
      connectOptions.timeout = ms(input.timeout);
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
