/**
 * Procedure Registration for test operations
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { testRun } from "./procedures/test/run.js";
import { testCoverage } from "./procedures/test/coverage.js";
import { TestRunInputSchema, TestCoverageInputSchema, } from "./types.js";
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
const testRunProcedure = createProcedure()
    .path(["test", "run"])
    .input(zodAdapter(TestRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run tests for a package",
    args: [],
    shorts: { cwd: "C", watch: "w", coverage: "c", pattern: "p" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return testRun(input, ctx);
})
    .build();
const testCoverageProcedure = createProcedure()
    .path(["test", "coverage"])
    .input(zodAdapter(TestCoverageInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run tests with coverage reporting",
    args: [],
    shorts: { cwd: "C", pattern: "p", threshold: "t" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return testCoverage(input, ctx);
})
    .build();
export function registerTestProcedures() {
    registerProcedures([
        testRunProcedure,
        testCoverageProcedure,
    ]);
}
// Auto-register
registerTestProcedures();
//# sourceMappingURL=register.js.map