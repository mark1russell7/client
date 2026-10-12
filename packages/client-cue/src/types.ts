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
  preset: z.string().optional().default("lib").describe("The preset: lib, react-lib or app"),
  force: z.boolean().optional().default(false).describe("Write dependencies.json again when it exists"),
  cwd: z.string().optional().describe("The folder of the package (default: the current folder)"),
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
  feature: z.string().describe("The feature: git, npm, ts, node, node-cjs, react, vite, vite-react, cue or vitest"),
  cwd: z.string().optional().describe("The folder of the package (default: the current folder)"),
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
  feature: z.string().describe("The feature: git, npm, ts, node, node-cjs, react, vite, vite-react, cue or vitest"),
  cwd: z.string().optional().describe("The folder of the package (default: the current folder)"),
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
  cwd: z.string().optional().describe("The folder of the package (default: the current folder)"),
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
  cwd: z.string().optional().describe("The folder of the package (default: the current folder)"),
});

export type CueValidateInput = z.infer<typeof CueValidateInputSchema>;

export interface CueValidateOutput {
  success: boolean;
  valid: boolean;
  features: string[];
  errors: string[];
  message?: string;
}
