/**
 * Procedure Registration
 *
 * Registers splay-client bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { defineProcedure, registerModule } from "client";

// =============================================================================
// Bridge Procedures
// =============================================================================

/**
 * Bridge namespace for splay-client procedures.
 */
const bridge = {
  /**
   * Get package info.
   */
  info: defineProcedure({
    metadata: {
      description: "Get splay-client bridge information",
    },
    handler: () => ({
      name: "@mark1russell7/splay-client",
      version: "1.0.0",
      description: "Bridge between splay and client",
    }),
  }),

  /**
   * Health check for the bridge.
   */
  health: defineProcedure({
    metadata: {
      description: "Health check for splay-client bridge",
    },
    handler: () => ({
      status: "healthy",
      timestamp: new Date().toISOString(),
    }),
  }),
};

// =============================================================================
// Registration
// =============================================================================

/**
 * Register all splay-client procedures.
 */
export function registerBridge(): void {
  registerModule(["splay", "bridge"], bridge);
}

// Auto-register when this module is loaded
registerBridge();
