/**
 * Procedure: server.call
 * Call a procedure on a remote peer through an outbound connection
 */

import { TIMEOUT_METADATA_KEY, createProcedure, pathToMethod, type Effects, type Procedure, type ProcedureContext } from "@procedures/client";
import { wrapSchema } from "../schema.js";
import { ServerCallOutputSchema } from "../output-schemas.js";
import { serverCallInputSchema } from "../input-schemas.js";
import { getConnection, connect, type Connection } from "../connection/index.js";

// =============================================================================
// Types
// =============================================================================

export interface ServerCallInput {
  /** Connection ID (from server.connect) */
  connectionId?: string | undefined;
  /** Remote address (alternative to connectionId - creates one-shot connection, closed after the call) */
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

const serverCallOutputSchema = wrapSchema<ServerCallOutput>(ServerCallOutputSchema);

export const serverCallProcedure: Procedure<
  ServerCallInput,
  ServerCallOutput,
  { description: string; effects: Effects; args: string[]; shorts: Record<string, string>; output: string }
> = createProcedure()
  .path(["server", "call"])
  .input(serverCallInputSchema)
  .output(serverCallOutputSchema)
  .meta({
    description: "Call a procedure on a remote peer through an outbound connection",
    // The remote procedure can change anything on its peer
    effects: { reads: ["network"], writes: ["network"] },
    args: ["path"],
    shorts: { connectionId: "c", address: "a" },
    output: "json",
  })
  .handler(async (input: ServerCallInput, ctx?: ProcedureContext): Promise<ServerCallOutput> => {
    // Normalize path: accept dot-separated string or array
    const pathArray = typeof input.path === "string"
      ? input.path.split(".")
      : input.path;

    // Resolve connection: by ID, or create one-shot from address
    let connectionId: string;
    let client: import("@procedures/client").Client;
    // The connection that this call makes for itself, from an address
    let oneShot: Connection | undefined;

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
      oneShot = await connect({ address: input.address });
      connectionId = oneShot.id;
      client = oneShot.client;
    } else {
      throw new Error("Either connectionId or address is required");
    }

    // Convert procedure path to Method format for client.call: the core mapping of every host
    // (deep dive architecture review 3.3)
    const method = pathToMethod(pathArray);

    // The signal and the remaining time of this call go with the relayed call (roadmap R14)
    const deadline = ctx?.capability?.deadline;
    try {
      const result = await client.call(method, input.input ?? {}, {
        ...(ctx?.signal ? { signal: ctx.signal } : {}),
        ...(deadline !== undefined ? { context: { [TIMEOUT_METADATA_KEY]: Math.max(0, deadline - Date.now()) } } : {}),
      });

      return {
        result,
        connectionId,
        path: pathArray,
      };
    } finally {
      // A one-shot connection ends with its call: after a success, an error and an abort. (Before,
      // each call left its client, its entry in the map and its socket: audit O56.) An error of the
      // close does not hide the result of the call.
      if (oneShot !== undefined) await oneShot.disconnect().catch(() => undefined);
    }
  })
  .build();
