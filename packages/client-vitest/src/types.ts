import { z } from "zod";

export const VitestRunInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
  exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
  watch: z.ZodOptional<z.ZodBoolean>;
  coverage: z.ZodOptional<z.ZodBoolean>;
  reporter: z.ZodOptional<z.ZodEnum<{ default: "default"; verbose: "verbose"; json: "json"; junit: "junit" }>>;
  passWithNoTests: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  cwd: z.string().optional().describe("The folder of the project (default: the current folder)"),
  include: z.array(z.string()).optional().describe("Test files or patterns to run (default: all tests)"),
  exclude: z.array(z.string()).optional().describe("Test files or patterns to leave out"),
  watch: z.boolean().optional().describe("Run in watch mode (use vitest.watch for a long-running watcher)"),
  coverage: z.boolean().optional().describe("Measure the coverage and give the percentages"),
  reporter: z.enum(["default", "verbose", "json", "junit"]).optional().describe("The vitest reporter"),
  passWithNoTests: z.boolean().optional().describe("Succeed when no test file matches"),
});
export type VitestRunInput = z.infer<typeof VitestRunInputSchema>;

export interface VitestRunOutput {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  /** The exit code of vitest (-1 when a signal ended it) */
  exitCode: number;
  /** The last 64 KiB of the output */
  stdout: string;
  stderr: string;
  coverage?: { lines: number; branches: number; functions: number; statements: number } | undefined;
}

// Output schemas (roadmap 2.1). Loose objects: a field that a schema does not name stays in the
// result (a strict schema would remove it when the output is validated).

export const VitestRunOutputSchema: z.ZodType<VitestRunOutput> = z.looseObject({
  success: z.boolean().describe("True when vitest ended with exit code 0 (and, for vitest.coverage, the threshold is met)"),
  passed: z.number().describe("The number of tests that passed"),
  failed: z.number().describe("The number of tests that failed"),
  skipped: z.number().describe("The number of tests that were skipped"),
  duration: z.number().describe("The time of the run, in milliseconds"),
  exitCode: z.number().describe("The exit code of vitest (-1 when a signal ended it)"),
  stdout: z.string().describe("The last 64 KiB of the output"),
  stderr: z.string().describe("The last 64 KiB of the error output"),
  coverage: z
    .looseObject({
      lines: z.number().describe("The line coverage, in percent"),
      branches: z.number().describe("The branch coverage, in percent"),
      functions: z.number().describe("The function coverage, in percent"),
      statements: z.number().describe("The statement coverage, in percent"),
    })
    .optional()
    .describe("The coverage percentages, when the run measured coverage"),
});

export const VitestCoverageInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
  exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
  threshold: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  cwd: z.string().optional().describe("The folder of the project (default: the current folder)"),
  include: z.array(z.string()).optional().describe("Test files or patterns to run (default: all tests)"),
  exclude: z.array(z.string()).optional().describe("Test files or patterns to leave out"),
  /** The minimum line coverage in percent. Below it, the result has `success: false`. */
  threshold: z.number().optional().describe("The minimum line coverage in percent. Below it, the result has `success: false`."),
});
export type VitestCoverageInput = z.infer<typeof VitestCoverageInputSchema>;

export const VitestWatchInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  cwd: z.string().optional().describe("The folder of the project (default: the current folder)"),
  include: z.array(z.string()).optional().describe("Test files or patterns to watch (default: all tests)"),
});
export type VitestWatchInput = z.infer<typeof VitestWatchInputSchema>;

export interface VitestWatchOutput {
  /** The id of the process in the process registry: vitest.stop takes it */
  id: string;
  pid: number;
  status: "started" | "stopped";
}

export const VitestWatchOutputSchema: z.ZodType<VitestWatchOutput> = z.looseObject({
  id: z.string().describe("The id of the process in the process registry: vitest.stop takes it"),
  pid: z.number().describe("The process id of vitest"),
  status: z.enum(["started", "stopped"]).describe("started, or stopped when vitest ended at once"),
});

// =============================================================================
// vitest.stop Types - Stop a vitest watch process
// =============================================================================

export const VitestStopInputSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** The id that vitest.watch gave. Without it, every vitest watch process stops. */
  id: z.string().optional().describe("The id that vitest.watch gave. Without it, every vitest watch process stops."),
});

export type VitestStopInput = z.infer<typeof VitestStopInputSchema>;

export interface VitestStopOutput {
  /** False when an id was given and no running watch process has it */
  success: boolean;
  /** The ids of the processes that stopped */
  stopped: string[];
}

// =============================================================================
// vitest.list Types - List the vitest watch processes
// =============================================================================

export const VitestListInputSchema: z.ZodObject<{
  output: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  /** Also give the end of the output of each process (the last 64 KiB) */
  output: z.boolean().optional().describe("Also give the end of the output of each process (the last 64 KiB)"),
});

export type VitestListInput = z.infer<typeof VitestListInputSchema>;

export interface VitestProcessInfo {
  id: string;
  pid: number;
  cwd?: string | undefined;
  status: "running" | "exited" | "error";
  startedAt: string;
  exitedAt?: string | undefined;
  exitCode?: number | undefined;
  /** With `output: true`, the end of the output */
  output?: string | undefined;
}

export interface VitestListOutput {
  processes: VitestProcessInfo[];
}

export const VitestStopOutputSchema: z.ZodType<VitestStopOutput> = z.looseObject({
  success: z.boolean().describe("False when an id was given and no running watch process has it"),
  stopped: z.array(z.string()).describe("The ids of the processes that stopped"),
});

export const VitestListOutputSchema: z.ZodType<VitestListOutput> = z.looseObject({
  processes: z
    .array(
      z.looseObject({
        id: z.string().describe("The id that vitest.stop takes"),
        pid: z.number().describe("The process id"),
        cwd: z.string().optional().describe("The folder of the project"),
        status: z.enum(["running", "exited", "error"]).describe("The state of the process"),
        startedAt: z.string().describe("The start time (ISO 8601)"),
        exitedAt: z.string().optional().describe("The end time (ISO 8601), when the process ended"),
        exitCode: z.number().optional().describe("The exit code, when the process ended"),
        output: z.string().optional().describe("With output: true, the last 64 KiB of the output"),
      })
    )
    .describe("The vitest watch processes of this host"),
});
