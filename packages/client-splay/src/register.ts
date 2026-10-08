/**
 * Procedure Registration
 *
 * Registers client-splay bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, PROCEDURE_REGISTRY, outputSchema } from "@mark1russell7/client";

// =============================================================================
// Types
// =============================================================================

interface BridgeInfo {
  name: string;
  version: string;
  description: string;
}

interface HealthCheck {
  status: string;
  timestamp: string;
}

// =============================================================================
// Schemas
// =============================================================================

const voidSchema = outputSchema<void>();
const bridgeInfoSchema = outputSchema<BridgeInfo>();
const healthCheckSchema = outputSchema<HealthCheck>();

// =============================================================================
// Bridge Procedures
// =============================================================================

/**
 * Get package info.
 */
const infoProcedure = createProcedure()
  .path(["splay", "bridge", "info"])
  .input(voidSchema)
  .output(bridgeInfoSchema)
  .meta({ description: "Get client-splay bridge information" })
  .handler(() => ({
    name: "@mark1russell7/client-splay",
    version: "1.0.0",
    description: "Bridge between splay and client",
  }))
  .build();

/**
 * Health check for the bridge.
 */
const healthProcedure = createProcedure()
  .path(["splay", "bridge", "health"])
  .input(voidSchema)
  .output(healthCheckSchema)
  .meta({ description: "Health check for client-splay bridge" })
  .handler(() => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
  }))
  .build();

// =============================================================================
// Registration
// =============================================================================

/**
 * Register all client-splay procedures.
 */
export function registerBridge(): void {
  // override: calling the exported function again (after the auto-register) must not throw
  PROCEDURE_REGISTRY.registerAll([infoProcedure, healthProcedure], { override: true });
}

// Auto-register when this module is loaded
registerBridge();
