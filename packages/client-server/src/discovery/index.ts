/**
 * Discovery Module
 *
 * Implements procedure discovery protocol for peers.
 * Peers exchange procedure manifests on connection.
 */

import {
  createProcedure,
  type Effects,
  type Procedure,
  type ProcedureContext,
  type ProcedureRegistry,
  type ProcedureRegistryLike,
  PROCEDURE_REGISTRY,
  REGISTRY_READ_EFFECTS,
} from "@procedures/client";
import { schema } from "../schema.js";
import type {
  ProcedureInfo,
  ProcedureAnnounceMessage,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

interface DiscoveryAnnounceInput {
  /** Optional peer ID of the connecting peer */
  peerId?: string;
}

// =============================================================================
// Discovery Procedure
// =============================================================================

const discoveryAnnounceInputSchema = schema<DiscoveryAnnounceInput>();
const discoveryAnnounceOutputSchema = schema<ProcedureAnnounceMessage>();

/**
 * Internal procedure for procedure discovery
 * Exposed at _discovery.announce
 */
export const discoveryAnnounceProcedure: Procedure<
  DiscoveryAnnounceInput,
  ProcedureAnnounceMessage,
  { description: string; internal: boolean; effects: Effects }
> = createProcedure()
  .path(["_discovery", "announce"])
  .input(discoveryAnnounceInputSchema)
  .output(discoveryAnnounceOutputSchema)
  .meta({
    description: "Exchange procedure manifests for discovery",
    internal: true,
    effects: REGISTRY_READ_EFFECTS,
  })
  .handler(async (_input: DiscoveryAnnounceInput, ctx?: ProcedureContext) => {
    // The procedures of the registry that serves this call (the peer's registry)
    const procedures = (ctx?.registry ?? PROCEDURE_REGISTRY).getAll();

    // Convert to ProcedureInfo format
    const procedureInfos: ProcedureInfo[] = procedures
      .filter((proc) => {
        // Skip internal procedures in discovery
        const meta = proc.metadata as { internal?: boolean } | undefined;
        return !meta?.internal;
      })
      .map((proc) => {
        const meta = proc.metadata as { description?: string } | undefined;
        const info: ProcedureInfo = {
          path: proc.path,
        };
        if (meta?.description !== undefined) {
          info.description = meta.description;
        }
        // TODO: Generate JSON schema from input/output schemas
        return info;
      });

    // Generate a peer ID based on process (could be configured)
    const peerId = `peer-${process.pid}-${Date.now().toString(36)}`;

    return {
      type: "procedure-announce" as const,
      peerId,
      procedures: procedureInfos,
    };
  })
  .build();

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get procedure info for all registered procedures of a registry (default: the global registry)
 */
export function getProcedureInfos(registry: ProcedureRegistryLike = PROCEDURE_REGISTRY): ProcedureInfo[] {
  const procedures = registry.getAll();

  return procedures
    .filter((proc) => proc.handler !== undefined)
    .map((proc) => {
      const meta = proc.metadata as { description?: string } | undefined;
      const info: ProcedureInfo = {
        path: proc.path,
      };
      if (meta?.description !== undefined) {
        info.description = meta.description;
      }
      return info;
    });
}

/**
 * Watch for procedure changes in a registry (default: the global registry)
 */
export function watchProcedures(
  callback: (event: "register" | "unregister", info: ProcedureInfo) => void,
  registry: ProcedureRegistry = PROCEDURE_REGISTRY
): () => void {
  const createHandler = (eventType: "register" | "unregister") => {
    return (proc: { path: string[]; metadata?: { description?: string } }) => {
      const info: ProcedureInfo = {
        path: proc.path,
      };
      if (proc.metadata?.description !== undefined) {
        info.description = proc.metadata.description;
      }
      callback(eventType, info);
    };
  };

  const registerHandler = createHandler("register");
  const unregisterHandler = createHandler("unregister");

  registry.on("register", registerHandler);
  registry.on("unregister", unregisterHandler);

  return () => {
    registry.off("register", registerHandler);
    registry.off("unregister", unregisterHandler);
  };
}
