/**
 * Procedure: server.connections
 * List all outbound connections to remote peers
 */

import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
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

const serverConnectionsInputSchema = schema<ServerConnectionsInput>();
const serverConnectionsOutputSchema = schema<ServerConnectionsOutput>();

export const serverConnectionsProcedure: Procedure<
  ServerConnectionsInput,
  ServerConnectionsOutput,
  { description: string; output: string }
> = createProcedure()
  .path(["server", "connections"])
  .input(serverConnectionsInputSchema)
  .output(serverConnectionsOutputSchema)
  .meta({
    description: "List outbound connections to remote peers",
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
