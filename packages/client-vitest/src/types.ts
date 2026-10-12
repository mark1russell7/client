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

export const VitestRunOutputSchema: z.ZodObject<{
  success: z.ZodBoolean;
  passed: z.ZodNumber;
  failed: z.ZodNumber;
  skipped: z.ZodNumber;
  duration: z.ZodNumber;
  exitCode: z.ZodNumber;
  stdout: z.ZodString;
  stderr: z.ZodString;
  coverage: z.ZodOptional<z.ZodObject<{
    lines: z.ZodNumber;
    branches: z.ZodNumber;
    functions: z.ZodNumber;
    statements: z.ZodNumber;
  }>>;
}> = z.object({
  success: z.boolean(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  duration: z.number(),
  /** The exit code of vitest (-1 when a signal ended it) */
  exitCode: z.number().describe("The exit code of vitest (-1 when a signal ended it)"),
  /** The last 64 KiB of the output */
  stdout: z.string().describe("The last 64 KiB of the output"),
  stderr: z.string(),
  coverage: z.object({
    lines: z.number(),
    branches: z.number(),
    functions: z.number(),
    statements: z.number(),
  }).optional(),
});
export type VitestRunOutput = z.infer<typeof VitestRunOutputSchema>;

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

export const VitestWatchOutputSchema: z.ZodObject<{
  id: z.ZodString;
  pid: z.ZodNumber;
  status: z.ZodEnum<{ started: "started"; stopped: "stopped" }>;
}> = z.object({
  /** The id of the process in the process registry: vitest.stop takes it */
  id: z.string().describe("The id of the process in the process registry: vitest.stop takes it"),
  pid: z.number(),
  status: z.enum(["started", "stopped"]),
});
export type VitestWatchOutput = z.infer<typeof VitestWatchOutputSchema>;

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
  cwd?: string;
  status: "running" | "exited" | "error";
  startedAt: string;
  exitedAt?: string;
  exitCode?: number;
  /** With `output: true`, the end of the output */
  output?: string;
}

export interface VitestListOutput {
  processes: VitestProcessInfo[];
}
