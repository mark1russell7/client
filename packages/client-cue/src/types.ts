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
  message?: string | undefined;
  error?: string | undefined;
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
  message?: string | undefined;
  error?: string | undefined;
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
  message?: string | undefined;
  error?: string | undefined;
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
  message?: string | undefined;
  error?: string | undefined;
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
  message?: string | undefined;
}

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema
// would remove it when the output is validated).

const messageField = z.string().optional().describe("A message about the result");
const errorField = z.string().optional().describe("The reason of a failure (when success is false)");

export const CueInitOutputSchema: z.ZodType<CueInitOutput> = z.looseObject({
  success: z.boolean().describe("True when dependencies.json exists after the call"),
  preset: z.string().describe("The preset of the new dependencies.json"),
  created: z.array(z.string()).describe("The files that the call made"),
  message: messageField,
  error: errorField,
});

export const CueAddOutputSchema: z.ZodType<CueAddOutput> = z.looseObject({
  success: z.boolean().describe("True when the feature is in dependencies.json after the call"),
  feature: z.string().describe("The feature"),
  added: z.boolean().describe("True when the call added the feature (false when it was there already)"),
  message: messageField,
  error: errorField,
});

export const CueRemoveOutputSchema: z.ZodType<CueRemoveOutput> = z.looseObject({
  success: z.boolean().describe("True when the feature is not in dependencies.json after the call"),
  feature: z.string().describe("The feature"),
  removed: z.boolean().describe("True when the call removed the feature"),
  message: messageField,
  error: errorField,
});

export const CueGenerateOutputSchema: z.ZodType<CueGenerateOutput> = z.looseObject({
  success: z.boolean().describe("True when every file was generated"),
  resolvedFeatures: z.array(z.string()).describe("The features with their dependencies"),
  generated: z.array(z.string()).describe("The files that the call wrote"),
  message: messageField,
  error: errorField,
});

export const CueValidateOutputSchema: z.ZodType<CueValidateOutput> = z.looseObject({
  success: z.boolean().describe("True when the validation ran"),
  valid: z.boolean().describe("True when dependencies.json is valid"),
  features: z.array(z.string()).describe("The features of dependencies.json"),
  errors: z.array(z.string()).describe("The problems that the validation found"),
  message: messageField,
});
