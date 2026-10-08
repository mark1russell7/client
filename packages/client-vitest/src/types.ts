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
  pid: z.ZodNumber;
  status: z.ZodEnum<["started", "stopped"]>;
}> = z.object({
  pid: z.number(),
  status: z.enum(["started", "stopped"]),
});
export type VitestWatchOutput = z.infer<typeof VitestWatchOutputSchema>;
