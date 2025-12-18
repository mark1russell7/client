/**
 * Types and schemas for cue procedures
 */

import { z } from "zod";

// =============================================================================
// Shared Types
// =============================================================================

export interface Feature {
  dependencies: string[];
}

export interface FeaturesManifest {
  features: Record<string, Feature>;
  presets: Record<string, string[]>;
}

export interface DependenciesJson {
  $schema?: string;
  dependencies: string[];
}

// =============================================================================
// cue.init
// =============================================================================

export const CueInitInputSchema: z.ZodObject<{
  preset: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  preset: z.string().optional().default("lib"),
  force: z.boolean().optional().default(false),
  cwd: z.string().optional(),
});

export type CueInitInput = z.infer<typeof CueInitInputSchema>;

export interface CueInitOutput {
  success: boolean;
  preset: string;
  created: string[];
  message?: string;
  error?: string;
}

// =============================================================================
// cue.add
// =============================================================================

export const CueAddInputSchema: z.ZodObject<{
  feature: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  feature: z.string(),
  cwd: z.string().optional(),
});

export type CueAddInput = z.infer<typeof CueAddInputSchema>;

export interface CueAddOutput {
  success: boolean;
  feature: string;
  added: boolean;
  message?: string;
  error?: string;
}

// =============================================================================
// cue.remove
// =============================================================================

export const CueRemoveInputSchema: z.ZodObject<{
  feature: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  feature: z.string(),
  cwd: z.string().optional(),
});

export type CueRemoveInput = z.infer<typeof CueRemoveInputSchema>;

export interface CueRemoveOutput {
  success: boolean;
  feature: string;
  removed: boolean;
  message?: string;
  error?: string;
}

// =============================================================================
// cue.generate
// =============================================================================

export const CueGenerateInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  cwd: z.string().optional(),
});

export type CueGenerateInput = z.infer<typeof CueGenerateInputSchema>;

export interface CueGenerateOutput {
  success: boolean;
  resolvedFeatures: string[];
  generated: string[];
  message?: string;
  error?: string;
}

// =============================================================================
// cue.validate
// =============================================================================

export const CueValidateInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  cwd: z.string().optional(),
});

export type CueValidateInput = z.infer<typeof CueValidateInputSchema>;

export interface CueValidateOutput {
  success: boolean;
  valid: boolean;
  features: string[];
  errors: string[];
  message?: string;
}
