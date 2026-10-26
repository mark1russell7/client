/**
 * Module (no side effects): the bridge procedures as data, for `createRegistry()`.
 *
 * Procedure Registration
 *
 * Registers client-splay bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, typed, defineModule, PURE_EFFECTS, type AnyProcedure, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client/browser";
// The manifest of this package, one folder above this module in `src` and in `dist`. A JSON import
// needs no Node built-in, so the browser bundlers include it (CLI-52).
import packageJson from "../package.json" with { type: "json" };

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

const voidSchema = typed<void>();
const bridgeInfoSchema = typed<BridgeInfo>();
const healthCheckSchema = typed<HealthCheck>();

// =============================================================================
// Bridge Procedures
// =============================================================================

/**
 * This procedure gives the name and the real version of this package, from its `package.json`.
 * Before, `splay.bridge.info` gave the version `1.0.0` for each version (roadmap R33). The JSON
 * import replaces the read with `node:fs/promises`, so the procedure also operates in a browser (CLI-52).
 */
const infoProcedure = createProcedure()
  .path(["splay", "bridge", "info"])
  .input(voidSchema)
  .output(bridgeInfoSchema)
  .meta({ description: "Get client-splay bridge information: its name and its version", effects: PURE_EFFECTS })
  .handler(() => ({ name: packageJson.name, version: packageJson.version, description: "Bridge between splay and client" }))
  .build();

/**
 * Health check for the bridge.
 */
const healthProcedure = createProcedure()
  .path(["splay", "bridge", "health"])
  .input(voidSchema)
  .output(healthCheckSchema)
  .meta({ description: "Health check for client-splay bridge", effects: PURE_EFFECTS })
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

/**
 * This function registers the procedures of @procedures/splay, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerSplayProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [splayModule], { override: true });
}

/** @deprecated Use `registerSplayProcedures`. The old name stays for one version. */
export const registerBridge: (registry?: ProcedureRegistry) => void = registerSplayProcedures;
