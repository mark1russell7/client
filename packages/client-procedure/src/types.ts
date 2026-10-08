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
  /** Procedure name (e.g., "greet" or "user.create") */
  name: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, "Name must be lowercase dot-separated segments"),
  /** Namespace override (defaults to first segment of name) */
  namespace: z.string().optional(),
  /** Procedure description for CLI help */
  description: z.string().optional(),
  /** Project path (defaults to cwd) */
  path: z.string().optional(),
  /** Preview changes without creating */
  dryRun: z.boolean().default(false),
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
