/**
 * Procedure Registration for CLI operations
 *
 * Provides cli.run procedure for calling mark CLI commands via client-shell.
 */

// Import shell dependency to ensure shell.exec is registered
import "@mark1russell7/client-shell";

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { cliRun } from "./procedures/cli/index.js";
import { CliRunInputSchema, type CliRunInput, type CliRunOutput } from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

// =============================================================================
// cli.run Procedure
// =============================================================================

const cliRunProcedure = createProcedure()
  .path(["cli", "run"])
  .input(zodAdapter<CliRunInput>(CliRunInputSchema))
  .output(outputSchema<CliRunOutput>())
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

export function registerCliProcedures(): void {
  registerProcedures([
    cliRunProcedure,
  ]);
}

// Auto-register
registerCliProcedures();
