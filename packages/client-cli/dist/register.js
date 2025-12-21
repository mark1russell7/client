/**
 * Procedure Registration for CLI operations
 *
 * Provides cli.run procedure for calling mark CLI commands via client-shell.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { cliRun } from "./procedures/cli/index.js";
import { CliRunInputSchema } from "./types.js";
function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                const parsed = schema.parse(data);
                return { success: true, data: parsed };
            }
            catch (error) {
                const err = error;
                return {
                    success: false,
                    error: {
                        message: err.message ?? "Validation failed",
                        errors: Array.isArray(err.errors)
                            ? err.errors.map((e) => {
                                const errObj = e;
                                return {
                                    path: (errObj.path ?? []),
                                    message: errObj.message ?? "Unknown error",
                                };
                            })
                            : [],
                    },
                };
            }
        },
        _output: undefined,
    };
}
function outputSchema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
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