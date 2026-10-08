/**
 * Procedure Registration for CLI operations
 *
 * Provides cli.run procedure for calling mark CLI commands via client-shell.
 */
// Import shell dependency to ensure shell.exec is registered
import "@mark1russell7/client-shell";
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { cliRun } from "./procedures/cli/index.js";
import { CliRunInputSchema } from "./types.js";
// =============================================================================
// cli.run Procedure
// =============================================================================
const cliRunProcedure = createProcedure()
    .path(["cli", "run"])
    .input(zodAdapter(CliRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run a mark CLI command",
    args: ["path"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return cliRun(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerCliProcedures() {
    registerProcedures([
        cliRunProcedure,
    ]);
}
// Auto-register
registerCliProcedures();
//# sourceMappingURL=register.js.map