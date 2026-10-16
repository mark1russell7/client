/**
 * The procedures of @procedures/tailscale as data. Importing this file registers nothing.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { tailscaleProcedures } from "./procedures.js";

export const tailscaleModule: ProcedureModule = defineModule("@procedures/tailscale", tailscaleProcedures);

export default tailscaleModule;

/**
 * This function registers the procedures of @procedures/tailscale in a registry. The default is the
 * global registry.
 */
export function registerTailscaleProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [tailscaleModule]);
}
