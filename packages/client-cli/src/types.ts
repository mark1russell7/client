/**
 * Type definitions for client-cli procedures
 *
 * client-cli wraps the mark CLI as procedures using client-shell.
 */

import { z } from "zod";

// =============================================================================
// cli.run Types
// =============================================================================

export const CliRunInputSchema: z.ZodObject<{
  path: z.ZodArray<z.ZodString>;
  args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
  positional: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Procedure path to call, e.g. ["lib", "new"] for "mark lib new" */
  path: z.array(z.string()),
  /** Named arguments as key-value pairs, e.g. { name: "foo" } -> "--name foo" */
  args: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  /** Positional arguments after the path */
  positional: z.array(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type CliRunInput = z.infer<typeof CliRunInputSchema>;

export interface CliRunOutput {
  /** Exit code of the command */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
}
