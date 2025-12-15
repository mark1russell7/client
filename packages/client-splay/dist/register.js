/**
 * Procedure Registration
 *
 * Registers splay-client bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures } from "client";
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
    .meta({ description: "Get splay-client bridge information" })
    .handler(() => ({
    name: "@mark1russell7/splay-client",
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
    .meta({ description: "Health check for splay-client bridge" })
    .handler(() => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
}))
    .build();
// =============================================================================
// Registration
// =============================================================================
/**
 * Register all splay-client procedures.
 */
export function registerBridge() {
    registerProcedures([infoProcedure, healthProcedure]);
}
// Auto-register when this module is loaded
registerBridge();
//# sourceMappingURL=register.js.map