/**
 * Procedure: server.connections
 * List all outbound connections to remote peers
 */

import { createProcedure, type Effects, type Procedure } from "@procedures/client";
import { wrapSchema } from "../schema.js";
import { ServerConnectionsOutputSchema } from "../output-schemas.js";
import { serverConnectionsInputSchema } from "../input-schemas.js";
import { getConnectionIds, getConnection } from "../connection/index.js";

// =============================================================================
// Types
// =============================================================================

export interface ServerConnectionsInput {
  // No input required
}

export interface ServerConnectionsOutput {
  connections: Array<{
    connectionId: string;
    remotePeerId: string;
    transport: string;
    state: string;
    remoteProcedureCount: number;
    connectedAt?: string | undefined;
  }>;
}

// =============================================================================
// Procedure
// =============================================================================

const serverConnectionsOutputSchema = wrapSchema<ServerConnectionsOutput>(ServerConnectionsOutputSchema);

export const serverConnectionsProcedure: Procedure<
  ServerConnectionsInput,
  ServerConnectionsOutput,
  { description: string; effects: Effects; output: string }
> = createProcedure()
  .path(["server", "connections"])
  .input(serverConnectionsInputSchema)
  .output(serverConnectionsOutputSchema)
  .meta({
    description: "List outbound connections to remote peers",
    // It reads the connections that server.connect opened, and sends nothing
    effects: { reads: ["network"], writes: [] },
    output: "json",
  })
  .handler(async (): Promise<ServerConnectionsOutput> => {
    const ids = getConnectionIds();
    const connections = ids.map((id) => {
      const conn = getConnection(id)!;
      return {
        connectionId: conn.id,
        remotePeerId: conn.remote.remotePeerId,
        transport: conn.remote.transport,
        state: conn.remote.state,
        remoteProcedureCount: conn.remote.remoteProcedures.length,
        connectedAt: conn.remote.connectedAt?.toISOString(),
      };
    });
    return { connections };
  })
  .build();
