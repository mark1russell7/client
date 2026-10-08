/**
 * Shell command types
 */

import { z } from "zod";

// =============================================================================
// shell.run Types
// =============================================================================

export const ShellRunInputSchema: z.ZodObject<{
  command: z.ZodString;
  args: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  timeout: z.ZodOptional<z.ZodNumber>;
  encoding: z.ZodDefault<z.ZodString>;
}> = z.object({
  /** Command to run */
  command: z.string(),
  /** Arguments to pass */
  args: z.array(z.string()).default([]),
  /** Working directory */
  cwd: z.string().optional(),
  /** Environment variables to set */
  env: z.record(z.string()).optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
  /** Encoding for output (default: utf8) */
  encoding: z.string().default("utf8"),
});

export type ShellRunInput = z.infer<typeof ShellRunInputSchema>;

export interface ShellRunOutput {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** The signal that ended the process, if it was killed (for example by the timeout) */
  signal?: string;
}

// =============================================================================
// shell.exec Types (more options)
// =============================================================================

export const ShellExecInputSchema: z.ZodObject<{
  command: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  timeout: z.ZodOptional<z.ZodNumber>;
  shell: z.ZodDefault<z.ZodUnion<[z.ZodBoolean, z.ZodString]>>;
  maxBuffer: z.ZodOptional<z.ZodNumber>;
  stdin: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Full command string to execute via shell */
  command: z.string(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
  /** Shell to use (default: system shell) */
  shell: z.union([z.boolean(), z.string()]).default(true),
  /** Max buffer size for stdout/stderr */
  maxBuffer: z.number().optional(),
  /** Input to pipe to stdin */
  stdin: z.string().optional(),
});

export type ShellExecInput = z.infer<typeof ShellExecInputSchema>;

export interface ShellExecOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  duration: number;
  /** Signal that terminated the process (if any) */
  signal?: string | undefined;
}

// =============================================================================
// shell.which Types
// =============================================================================

export const ShellWhichInputSchema: z.ZodObject<{
  command: z.ZodString;
}> = z.object({
  /** Command to find */
  command: z.string(),
});

export type ShellWhichInput = z.infer<typeof ShellWhichInputSchema>;

export interface ShellWhichOutput {
  /** Full path to command, or null if not found */
  path: string | null;
  /** Whether command was found */
  found: boolean;
}
