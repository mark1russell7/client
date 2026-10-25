/**
 * Procedure: server.create
 * Creates a transport-agnostic peer that exposes procedures
 */

import { createProcedure, type Effects, type Procedure, type ProcedureContext, PROCEDURE_REGISTRY, ProcedureRegistry } from "@procedures/client";
import { wrapSchema } from "../schema.js";
import { ServerCreateOutputSchema } from "../output-schemas.js";
import { serverCreateInputSchema } from "../input-schemas.js";
import type { ServerCreateInput, ServerCreateOutput } from "../types.js";
import { createPeer, type Peer } from "../peer/index.js";
import { exposeRule } from "../expose.js";

// Use pass-through schemas for simplicity (validation happens at Zod level if needed)
const serverCreateOutputSchema = wrapSchema<ServerCreateOutput>(ServerCreateOutputSchema);

// Active peers (module-level state for now, could be in context)
const activePeers = new Map<string, Peer>();

export const serverCreateProcedure: Procedure<
  ServerCreateInput,
  ServerCreateOutput,
  { description: string; effects: Effects }
> = createProcedure()
  .path(["server", "create"])
  .input(serverCreateInputSchema)
  .output(serverCreateOutputSchema)
  .meta({
    description: "Create a transport-agnostic peer that exposes procedures",
    // Each call starts a new peer that listens on its transports. It replaces nothing.
    effects: { reads: ["registry"], writes: ["network", "server"], destructive: false },
  })
  .handler(async (input: ServerCreateInput, ctx?: ProcedureContext) => {
    // The registry of the caller: a host with its own registry serves its own procedures
    const registry = ctx?.registry instanceof ProcedureRegistry ? ctx.registry : PROCEDURE_REGISTRY;

    // Generate unique server ID
    const serverId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Default transports if not specified
    // A server-wide token goes to each transport that has none of its own
    const transports = (input.transports ?? [{ type: "http" as const, port: 3000 }]).map((transport) =>
      transport.type === "local" || input.token === undefined || transport.token !== undefined
        ? transport
        : { ...transport, token: input.token }
    );
    const autoRegister = input.autoRegister ?? true;

    // Create peer with configured transports
    const peer = await createPeer({
      id: serverId,
      transports,
      autoRegister,
      registry,
      ...(input.expose ? { expose: exposeRule(input.expose) } : {}),
    });

    // Start the peer
    await peer.start();

    // Store for later reference
    activePeers.set(serverId, peer);

    // Get procedure count
    const procedureCount = autoRegister
      ? registry.getAll().filter((p) => p.handler).length
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
