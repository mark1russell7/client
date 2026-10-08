/**
 * Test execution types
 */

import { z } from "zod";

// =============================================================================
// test.run Types
// =============================================================================

export const TestRunInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  pattern: z.ZodOptional<z.ZodString>;
  watch: z.ZodDefault<z.ZodBoolean>;
  coverage: z.ZodDefault<z.ZodBoolean>;
  reporter: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Working directory (package path) */
  cwd: z.string().optional(),
  /** Test file pattern */
  pattern: z.string().optional(),
  /** Watch mode */
  watch: z.boolean().default(false),
  /** Enable coverage */
  coverage: z.boolean().default(false),
  /** Reporter to use */
  reporter: z.string().optional(),
  /** Test timeout in ms */
  timeout: z.number().optional(),
});

export type TestRunInput = z.infer<typeof TestRunInputSchema>;

export interface TestRunOutput {
  /** Whether tests passed */
  success: boolean;
  /** Exit code from test runner */
  exitCode: number;
  /** Test output */
  stdout: string;
  /** Error output */
  stderr: string;
  /** Duration in ms */
  duration: number;
}

// =============================================================================
// test.coverage Types
// =============================================================================

export const TestCoverageInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  pattern: z.ZodOptional<z.ZodString>;
  threshold: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Working directory (package path) */
  cwd: z.string().optional(),
  /** Test file pattern */
  pattern: z.string().optional(),
  /** Coverage threshold (0-100) */
  threshold: z.number().optional(),
});

export type TestCoverageInput = z.infer<typeof TestCoverageInputSchema>;

export interface TestCoverageOutput {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  /** Coverage percentage if parseable */
  coverage?: number | undefined;
}
