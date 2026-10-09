import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import {
  VitestCoverageInputSchema,
  VitestListInputSchema,
  VitestRunInputSchema,
  VitestStopInputSchema,
  VitestWatchInputSchema,
  type VitestListOutput,
  type VitestRunOutput,
  type VitestStopOutput,
  type VitestWatchOutput,
} from "./types.js";
import { vitestCoverage, vitestRun } from "./procedures/vitest/run.js";
import { vitestWatch } from "./procedures/vitest/watch.js";
import { vitestStop } from "./procedures/vitest/stop.js";
import { vitestList } from "./procedures/vitest/list.js";

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

const vitestStopProcedure = createProcedure()
  .path(["vitest", "stop"])
  .input(zodAdapter(VitestStopInputSchema))
  .output(outputSchema<VitestStopOutput>())
  .meta({
    description: "Stop a vitest watch process (all of them without an id)",
    args: ["id"],
    shorts: {},
    output: "json",
  })
  .handler(vitestStop)
  .build();

const vitestListProcedure = createProcedure()
  .path(["vitest", "list"])
  .input(zodAdapter(VitestListInputSchema))
  .output(outputSchema<VitestListOutput>())
  .meta({
    description: "List the vitest watch processes of this host",
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(vitestList)
  .build();

registerProcedures([
  vitestRunProcedure,
  vitestCoverageProcedure,
  vitestWatchProcedure,
  vitestStopProcedure,
  vitestListProcedure,
]);


