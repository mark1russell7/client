/**
 * Procedure Registration
 *
 * Registers client-splay bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";

// =============================================================================
// Minimal Schema Helpers (Zod-like interface for procedure system)
// =============================================================================

interface ZodErrorLike {
  message: string;
  errors: Array<{ path: (string | number)[]; message: string }>;
}

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodErrorLike };
  _output: T;
}

function schema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

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

const voidSchema = schema<void>();
const bridgeInfoSchema = schema<BridgeInfo>();
const healthCheckSchema = schema<HealthCheck>();

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
  registerProcedures([infoProcedure, healthProcedure]);
}

// Auto-register when this module is loaded
registerBridge();
