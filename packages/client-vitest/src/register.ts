import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import {
  VitestCoverageInputSchema,
  VitestRunInputSchema,
  VitestWatchInputSchema,
  type VitestRunOutput,
  type VitestWatchOutput,
} from "./types.js";
import { vitestCoverage, vitestRun } from "./procedures/vitest/run.js";
import { vitestWatch } from "./procedures/vitest/watch.js";

const vitestRunProcedure = createProcedure()
  .path(["vitest", "run"])
  .input(zodAdapter(VitestRunInputSchema))
  .output(outputSchema<VitestRunOutput>())
  .meta({
    description: "Run vitest tests once (no shell; uses the project's own vitest)",
    // Positional field names, and field -> short flag (the convention mark's CLI parser reads)
    args: ["cwd"],
    shorts: { coverage: "c" },
    output: "json",
  })
  .handler(vitestRun)
  .build();

const vitestCoverageProcedure = createProcedure()
  .path(["vitest", "coverage"])
  .input(zodAdapter(VitestCoverageInputSchema))
  .output(outputSchema<VitestRunOutput>())
  .meta({
    description: "Run vitest once with coverage, and check a minimum line coverage (no shell)",
    args: ["cwd"],
    shorts: { threshold: "t" },
    output: "json",
  })
  .handler(vitestCoverage)
  .build();

const vitestWatchProcedure = createProcedure()
  .path(["vitest", "watch"])
  .input(zodAdapter(VitestWatchInputSchema))
  .output(outputSchema<VitestWatchOutput>())
  .meta({
    description: "Start vitest in watch mode (no shell; uses the project's own vitest)",
    args: ["cwd"],
    shorts: {},
    output: "json",
  })
  .handler(vitestWatch)
  .build();

registerProcedures([vitestRunProcedure, vitestCoverageProcedure, vitestWatchProcedure]);


