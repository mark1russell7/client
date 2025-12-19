/**
 * Procedure Registration for shell operations
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { shellRun } from "./procedures/shell/run.js";
import { shellExec } from "./procedures/shell/exec.js";
import { shellWhich } from "./procedures/shell/which.js";
import { ShellRunInputSchema, ShellExecInputSchema, ShellWhichInputSchema, } from "./types.js";
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
// Procedure definitions
const shellRunProcedure = createProcedure()
    .path(["shell", "run"])
    .input(zodAdapter(ShellRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run a command with arguments",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
})
    .handler(async (input) => {
    return shellRun(input);
})
    .build();
const shellExecProcedure = createProcedure()
    .path(["shell", "exec"])
    .input(zodAdapter(ShellExecInputSchema))
    .output(outputSchema())
    .meta({
    description: "Execute command string via shell",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
})
    .handler(async (input) => {
    return shellExec(input);
})
    .build();
const shellWhichProcedure = createProcedure()
    .path(["shell", "which"])
    .input(zodAdapter(ShellWhichInputSchema))
    .output(outputSchema())
    .meta({
    description: "Find the path to a command",
    args: ["command"],
    shorts: {},
    output: "json",
})
    .handler(async (input) => {
    return shellWhich(input);
})
    .build();
export function registerShellProcedures() {
    registerProcedures([
        shellRunProcedure,
        shellExecProcedure,
        shellWhichProcedure,
    ]);
}
// Auto-register
registerShellProcedures();
//# sourceMappingURL=register.js.map