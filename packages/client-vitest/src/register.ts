import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { z } from "zod";
import {
  VitestRunInputSchema,
  
  VitestWatchInputSchema,
  
  type VitestRunOutput,
  type VitestWatchOutput,
} from "./types.js";
import { vitestRun } from "./procedures/vitest/run.js";
import { vitestWatch } from "./procedures/vitest/watch.js";

function zodAdapter<T>(schema: z.ZodType<T>): {
  parse: (input: unknown) => T;
  safeParse: (input: unknown) => z.SafeParseReturnType<unknown, T>;
} {
  return {
    parse: (input: unknown): T => schema.parse(input),
    safeParse: (input: unknown) => schema.safeParse(input),
  };
}

function outputSchema<T>(): {
  parse: (output: unknown) => T;
  safeParse: (output: unknown) => { success: true; data: T };
} {
  return {
    parse: (output: unknown): T => output as T,
    safeParse: (output: unknown) => ({ success: true as const, data: output as T }),
  };
}

const vitestRunProcedure = createProcedure()
  .path(["vitest", "run"])
  .input(zodAdapter(VitestRunInputSchema))
  .output(outputSchema<VitestRunOutput>())
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
  .output(outputSchema<VitestWatchOutput>())
  .meta({
    description: "Start vitest in watch mode",
    args: [{ name: "cwd", type: "string", description: "Working directory" }],
    shorts: {},
    output: "json",
  })
  .handler(vitestWatch)
  .build();

registerProcedures([vitestRunProcedure, vitestWatchProcedure]);


