import { z } from "zod";

export const VitestRunInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
  exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
  watch: z.ZodOptional<z.ZodBoolean>;
  coverage: z.ZodOptional<z.ZodBoolean>;
  reporter: z.ZodOptional<z.ZodEnum<["default", "verbose", "json", "junit"]>>;
  passWithNoTests: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  watch: z.boolean().optional(),
  coverage: z.boolean().optional(),
  reporter: z.enum(["default", "verbose", "json", "junit"]).optional(),
  passWithNoTests: z.boolean().optional(),
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
  exitCode: z.number(),
  /** The last 64 KiB of the output */
  stdout: z.string(),
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
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  /** The minimum line coverage in percent. Below it, the result has `success: false`. */
  threshold: z.number().optional(),
});
export type VitestCoverageInput = z.infer<typeof VitestCoverageInputSchema>;

export const VitestWatchInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
});
export type VitestWatchInput = z.infer<typeof VitestWatchInputSchema>;

export const VitestWatchOutputSchema: z.ZodObject<{
  id: z.ZodString;
  pid: z.ZodNumber;
  status: z.ZodEnum<["started", "stopped"]>;
}> = z.object({
  /** The id of the process in the process registry: vitest.stop takes it */
  id: z.string(),
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
  id: z.string().optional(),
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
  output: z.boolean().optional(),
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
