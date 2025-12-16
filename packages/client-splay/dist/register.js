/**
 * Procedure Registration
 *
 * Registers client-splay bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
function schema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
// =============================================================================
// Schemas
// =============================================================================
const voidSchema = schema();
const bridgeInfoSchema = schema();
const healthCheckSchema = schema();
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
export function registerBridge() {
    registerProcedures([infoProcedure, healthProcedure]);
}
// Auto-register when this module is loaded
registerBridge();
//# sourceMappingURL=register.js.map