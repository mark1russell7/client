/**
 * Type definitions for client-procedure
 */

import { z } from "zod";

// =============================================================================
// procedure.new Types
// =============================================================================

export const ProcedureNewInputSchema: z.ZodObject<{
  name: z.ZodString;
  namespace: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  path: z.ZodOptional<z.ZodString>;
  dryRun: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /** Procedure name (e.g., "greet", "user.create" or "fs.readJson") */
  name: z
    .string()
    .regex(
      /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/,
      "Name must be dot-separated segments, each starting with a lowercase letter (camelCase is allowed)"
    ).describe("Procedure name (e.g., \"greet\", \"user.create\" or \"fs.readJson\")"),
  /** Namespace override (defaults to first segment of name): the folder under src/procedures */
  namespace: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/, "Namespace must be one segment that starts with a lowercase letter")
    .optional().describe("Namespace override (defaults to first segment of name): the folder under src/procedures"),
  /** Procedure description for CLI help */
  description: z.string().optional().describe("Procedure description for CLI help"),
  /** Project path (defaults to cwd) */
  path: z.string().optional().describe("Project path (defaults to cwd)"),
  /** Preview changes without creating */
  dryRun: z.boolean().default(false).describe("Preview changes without creating"),
});

export type ProcedureNewInput = z.infer<typeof ProcedureNewInputSchema>;

export interface ProcedureNewOutput {
  /** Whether creation succeeded */
  success: boolean;
  /** Full procedure path (e.g., ["user", "create"]) */
  procedurePath: string[];
  /** Files created */
  created: string[];
  /** Files modified */
  modified: string[];
  /** Operations performed */
  operations: string[];
  /** Any errors encountered */
  errors: string[];
}
