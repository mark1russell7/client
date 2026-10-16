/**
 * Module (no side effects): the bridge procedures as data, for `createRegistry()`.
 *
 * Procedure Registration
 *
 * Registers client-splay bridge procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, outputSchema, defineModule, PURE_EFFECTS, type AnyProcedure, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";

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

/** The name and the version of this package, after the first read of its `package.json`. */
let manifest: Promise<{ name: string; version: string }> | undefined;

/**
 * This function reads the name and the version of this package from its `package.json`, once.
 * The file is one folder above this module, in `src` and in `dist`. The read starts at the first
 * call, so an import of this module reads no file. Before, `splay.bridge.info` gave the version
 * `1.0.0` for each version (roadmap R33).
 */
function packageManifest(): Promise<{ name: string; version: string }> {
  manifest ??= (async () => {
    const { readFile } = await import("node:fs/promises");
    const json = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { name?: unknown; version?: unknown };
    if (typeof json.name !== "string" || typeof json.version !== "string") {
      throw new Error("The package.json of @procedures/splay has no name or no version");
    }
    return { name: json.name, version: json.version };
  })().catch((error: unknown) => {
    // A failed read can succeed later: do not keep the failure
    manifest = undefined;
    throw error;
  });
  return manifest;
}

/**
 * Get package info: the name and the real version of this package.
 */
const infoProcedure = createProcedure()
  .path(["splay", "bridge", "info"])
  .input(voidSchema)
  .output(bridgeInfoSchema)
  .meta({ description: "Get client-splay bridge information: its name and its version", effects: PURE_EFFECTS })
  .handler(async () => {
    const { name, version } = await packageManifest();
    return { name, version, description: "Bridge between splay and client" };
  })
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
