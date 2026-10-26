/**
 * The procedures of @procedures/tailscale as data. Importing this file registers nothing. The
 * module requires the module of `@procedures/shell`: `tailscale.run` calls `shell.run`.
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import { createTailscaleProcedures, tailscaleProcedures, type TailscaleProceduresOptions } from "./procedures.js";

export const tailscaleModule: ProcedureModule = defineModule("@procedures/tailscale", tailscaleProcedures, [shellModule]);

export default tailscaleModule;

/**
 * This function gives the module with the settings of the host: the tailscale program. Without
 * options, it gives `tailscaleModule`.
 *
 * ```ts
 * createRegistry(createTailscaleModule({ executable: "/opt/tailscale/bin/tailscale" }));
 * ```
 */
export function createTailscaleModule(options: TailscaleProceduresOptions = {}): ProcedureModule {
  if (options.executable === undefined) return tailscaleModule;
  return defineModule("@procedures/tailscale", createTailscaleProcedures(options), [shellModule]);
}

/**
 * This function registers the procedures of @procedures/tailscale in a registry. The default is the
 * global registry.
 */
export function registerTailscaleProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [tailscaleModule]);
}
