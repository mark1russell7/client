/**
 * Procedure: server.call
 * Call a procedure on a remote peer through an outbound connection
 */

import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import { getConnection, connect } from "../connection/index.js";

// =============================================================================
// Types
// =============================================================================

export interface ServerCallInput {
  /** Connection ID (from server.connect) */
  connectionId?: string | undefined;
  /** Remote address (alternative to connectionId - creates one-shot connection) */
  address?: string | undefined;
  /** Procedure path on the remote peer - dot-separated string or array */
  path: string | string[];
  /** Input payload for the remote procedure */
  input?: unknown;
}

export interface ServerCallOutput {
  /** Result from the remote procedure */
  result: unknown;
  /** Connection ID used */
  connectionId: string;
  /** Procedure path called */
  path: string[];
}

// =============================================================================
// Procedure
// =============================================================================

const serverCallInputSchema = schema<ServerCallInput>();
const serverCallOutputSchema = schema<ServerCallOutput>();

export const serverCallProcedure: Procedure<
  ServerCallInput,
  ServerCallOutput,
  { description: string; args: string[]; shorts: Record<string, string>; output: string }
> = createProcedure()
  .path(["server", "call"])
  .input(serverCallInputSchema)
  .output(serverCallOutputSchema)
  .meta({
    description: "Call a procedure on a remote peer through an outbound connection",
    args: ["path"],
    shorts: { connectionId: "c", address: "a" },
    output: "json",
  })
  .handler(async (input: ServerCallInput): Promise<ServerCallOutput> => {
    // Normalize path: accept dot-separated string or array
    const pathArray = typeof input.path === "string"
      ? input.path.split(".")
      : input.path;

    // Resolve connection: by ID, or create one-shot from address
    let connectionId: string;
    let client: import("@mark1russell7/client").Client;

    if (input.connectionId) {
      const connection = getConnection(input.connectionId);
      if (!connection) {
        throw new Error(
          `Connection not found: ${input.connectionId}. Use 'server connect' first, or pass --address.`
        );
      }
      connectionId = connection.id;
      client = connection.client;
    } else if (input.address) {
      // Create a connection on-the-fly
      const connection = await connect({ address: input.address });
      connectionId = connection.id;
      client = connection.client;
    } else {
      throw new Error("Either connectionId or address is required");
    }

    // Convert procedure path to Method format for client.call
    const [service, ...rest] = pathArray;
    if (!service) {
      throw new Error("Procedure path must have at least one segment");
    }
    const method = { service, operation: rest.join(".") };

    const result = await client.call(method, input.input ?? {});

    return {
      result,
      connectionId,
      path: pathArray,
    };
  })
  .build();
