/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for CLI operations
 *
 * Provides cli.run procedure for calling mark CLI commands via client-shell.
 */


import { createProcedure, zodAdapter, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import { cliRun } from "./procedures/cli/index.js";
import { CliRunInputSchema, CliRunOutputSchema, type CliRunInput, type CliRunOutput } from "./types.js";
import type { ProcedureContext } from "@procedures/client";

// =============================================================================
// cli.run Procedure
// =============================================================================

const cliRunProcedure = createProcedure()
  .path(["cli", "run"])
  .input(zodAdapter<CliRunInput>(CliRunInputSchema))
  .output(zodAdapter<CliRunOutput>(CliRunOutputSchema))
  .meta({
    description: "Run a mark CLI command",
    args: ["path"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: CliRunInput, ctx: ProcedureContext): Promise<CliRunOutput> => {
    return cliRun(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const cliModule: ProcedureModule = defineModule("@procedures/cli-run", [
    cliRunProcedure,
  ], [shellModule]);

export default cliModule;

/**
 * This function registers the procedures of @procedures/cli-run, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerCliProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [cliModule]);
}
