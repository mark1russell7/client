/**
 * Procedure Registration for test operations
 */
// Import shell dependency to ensure shell.exec is registered
import "@mark1russell7/client-shell";
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { testRun } from "./procedures/test/run.js";
import { testCoverage } from "./procedures/test/coverage.js";
import { TestRunInputSchema, TestCoverageInputSchema, } from "./types.js";
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