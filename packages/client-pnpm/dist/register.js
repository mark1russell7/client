/**
 * Procedure Registration for pnpm operations
 *
 * Provides pnpm.install, pnpm.add, pnpm.remove, pnpm.link, pnpm.run procedures.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { pnpmInstall, pnpmAdd, pnpmRemove, pnpmLink, pnpmRun } from "./procedures/pnpm/index.js";
import { PnpmInstallInputSchema, PnpmAddInputSchema, PnpmRemoveInputSchema, PnpmLinkInputSchema, PnpmRunInputSchema, } from "./types.js";
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
// Procedures
// =============================================================================
const pnpmInstallProcedure = createProcedure()
    .path(["pnpm", "install"])
    .input(zodAdapter(PnpmInstallInputSchema))
    .output(outputSchema())
    .meta({
    description: "Install packages using pnpm",
    shorts: { cwd: "C", dev: "D", frozen: "F" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return pnpmInstall(input, ctx);
})
    .build();
const pnpmAddProcedure = createProcedure()
    .path(["pnpm", "add"])
    .input(zodAdapter(PnpmAddInputSchema))
    .output(outputSchema())
    .meta({
    description: "Add packages using pnpm",
    args: ["packages"],
    shorts: { cwd: "C", dev: "D", global: "g" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return pnpmAdd(input, ctx);
})
    .build();
const pnpmRemoveProcedure = createProcedure()
    .path(["pnpm", "remove"])
    .input(zodAdapter(PnpmRemoveInputSchema))
    .output(outputSchema())
    .meta({
    description: "Remove packages using pnpm",
    args: ["packages"],
    shorts: { cwd: "C", global: "g" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return pnpmRemove(input, ctx);
})
    .build();
const pnpmLinkProcedure = createProcedure()
    .path(["pnpm", "link"])
    .input(zodAdapter(PnpmLinkInputSchema))
    .output(outputSchema())
    .meta({
    description: "Link packages using pnpm",
    shorts: { cwd: "C", global: "g" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return pnpmLink(input, ctx);
})
    .build();
const pnpmRunProcedure = createProcedure()
    .path(["pnpm", "run"])
    .input(zodAdapter(PnpmRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run package scripts using pnpm",
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return pnpmRun(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerPnpmProcedures() {
    registerProcedures([
        pnpmInstallProcedure,
        pnpmAddProcedure,
        pnpmRemoveProcedure,
        pnpmLinkProcedure,
        pnpmRunProcedure,
    ]);
}
// Auto-register
registerPnpmProcedures();
//# sourceMappingURL=register.js.map