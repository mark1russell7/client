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
  describeRegistry,
  type AnyProcedure,
  type ProcedureEntry,
  type ProcedurePath,
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
    // The one manifest of the core (roadmap R17): the procedures of the registry that serves this
    // call and that the host exposes, with their JSON Schemas, without the internal ones.
    // Before, the announce gave no schemas and listed the procedures that the host hides.
    const manifest = describeRegistry(ctx?.registry ?? PROCEDURE_REGISTRY, {
      ...(ctx?.expose ? { expose: ctx.expose } : {}),
      include: (proc: AnyProcedure) => !(proc.metadata as { internal?: boolean } | undefined)?.internal,
    });
    const procedureInfos: ProcedureInfo[] = manifest.procedures.map(infoOf);

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
export function getProcedureInfos(
  registry: ProcedureRegistryLike = PROCEDURE_REGISTRY,
  expose?: (path: ProcedurePath) => boolean
): ProcedureInfo[] {
  // The one manifest of the core (roadmap R17), without the schemas
  return describeRegistry(registry, { schemas: false, ...(expose ? { expose } : {}) }).procedures.map(infoOf);
}

/** The ProcedureInfo of a manifest entry: the form that the peers exchange. */
export function infoOf(entry: ProcedureEntry): ProcedureInfo {
  const info: ProcedureInfo = { path: [...entry.path] };
  if (entry.description !== undefined) info.description = entry.description;
  if (entry.input) info.inputSchema = entry.input;
  if (entry.output) info.outputSchema = entry.output;
  return info;
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
