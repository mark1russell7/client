/**
 * Discovery Module
 *
 * Implements procedure discovery protocol for peers.
 * Peers exchange procedure manifests on connection.
 */

import {
  createProcedure,
  type Procedure,
  PROCEDURE_REGISTRY,
} from "@mark1russell7/client";
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
  { description: string; internal: boolean }
> = createProcedure()
  .path(["_discovery", "announce"])
  .input(discoveryAnnounceInputSchema)
  .output(discoveryAnnounceOutputSchema)
  .meta({
    description: "Exchange procedure manifests for discovery",
    internal: true,
  })
  .handler(async (_input: DiscoveryAnnounceInput) => {
    // Get all registered procedures
    const procedures = PROCEDURE_REGISTRY.getAll();

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
 * Get procedure info for all registered procedures
 */
export function getProcedureInfos(): ProcedureInfo[] {
  const procedures = PROCEDURE_REGISTRY.getAll();

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
 * Watch for procedure changes
 */
export function watchProcedures(
  callback: (event: "register" | "unregister", info: ProcedureInfo) => void
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

  PROCEDURE_REGISTRY.on("register", registerHandler);
  PROCEDURE_REGISTRY.on("unregister", unregisterHandler);

  return () => {
    PROCEDURE_REGISTRY.off("register", registerHandler);
    PROCEDURE_REGISTRY.off("unregister", unregisterHandler);
  };
}
