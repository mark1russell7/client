import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { VitestRunInputSchema, VitestWatchInputSchema, } from "./types.js";
import { vitestRun } from "./procedures/vitest/run.js";
import { vitestWatch } from "./procedures/vitest/watch.js";
const vitestRunProcedure = createProcedure()
    .path(["vitest", "run"])
    .input(zodAdapter(VitestRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run vitest tests",
    args: [
        { name: "cwd", type: "string", description: "Working directory" },
        { name: "coverage", type: "boolean", description: "Enable coverage" },
    ],
    shorts: { c: "coverage" },
    output: "json",
})
    .handler(vitestRun)
    .build();
const vitestWatchProcedure = createProcedure()
    .path(["vitest", "watch"])
    .input(zodAdapter(VitestWatchInputSchema))
    .output(outputSchema())
    .meta({
    description: "Start vitest in watch mode",
    args: [{ name: "cwd", type: "string", description: "Working directory" }],
    shorts: {},
    output: "json",
})
    .handler(vitestWatch)
    .build();
registerProcedures([vitestRunProcedure, vitestWatchProcedure]);
//# sourceMappingURL=register.js.map