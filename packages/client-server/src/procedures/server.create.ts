/**
 * Procedure: server.create
 * Creates a transport-agnostic peer that exposes procedures
 */

import { createProcedure, type Procedure, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ServerCreateInput, ServerCreateOutput } from "../types.js";
import { createPeer, type Peer } from "../peer/index.js";

// Use pass-through schemas for simplicity (validation happens at Zod level if needed)
const serverCreateInputSchema = schema<ServerCreateInput>();
const serverCreateOutputSchema = schema<ServerCreateOutput>();

// Active peers (module-level state for now, could be in context)
const activePeers = new Map<string, Peer>();

export const serverCreateProcedure: Procedure<
  ServerCreateInput,
  ServerCreateOutput,
  { description: string }
> = createProcedure()
  .path(["server", "create"])
  .input(serverCreateInputSchema)
  .output(serverCreateOutputSchema)
  .meta({ description: "Create a transport-agnostic peer that exposes procedures" })
  .handler(async (input: ServerCreateInput) => {
    // Generate unique server ID
    const serverId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Default transports if not specified
    const transports = input.transports ?? [{ type: "http" as const, port: 3000 }];
    const autoRegister = input.autoRegister ?? true;

    // Create peer with configured transports
    const peer = await createPeer({
      id: serverId,
      transports,
      autoRegister,
      registry: PROCEDURE_REGISTRY,
    });

    // Start the peer
    await peer.start();

    // Store for later reference
    activePeers.set(serverId, peer);

    // Get procedure count
    const procedureCount = input.autoRegister
      ? PROCEDURE_REGISTRY.getAll().filter((p) => p.handler).length
      : 0;

    return {
      serverId,
      endpoints: peer.getEndpoints(),
      procedureCount,
    };
  })
  .build();

/**
 * Get an active peer by ID
 */
export function getPeer(serverId: string): Peer | undefined {
  return activePeers.get(serverId);
}

/**
 * Get all active peer IDs
 */
export function getActivePeerIds(): string[] {
  return Array.from(activePeers.keys());
}

export type { ServerCreateInput, ServerCreateOutput };
