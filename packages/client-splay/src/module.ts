/**
 * Module (no side effects): the bridge procedures as data, for `createRegistry()`.
 *
 * Procedure Registration
 *
 * Registers client-splay bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, outputSchema, defineModule, type AnyProcedure, type ProcedureModule } from "@procedures/client";

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
    name: "@procedures/splay",
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
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const splayModule: ProcedureModule = defineModule("@procedures/splay", [
  infoProcedure as AnyProcedure,
  healthProcedure as AnyProcedure,
]);

export default splayModule;
