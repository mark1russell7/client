/**
 * Types and schemas for cue procedures
 */
import { z } from "zod";
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
export declare const CueInitInputSchema: z.ZodObject<{
    preset: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type CueInitInput = z.infer<typeof CueInitInputSchema>;
export interface CueInitOutput {
    success: boolean;
    preset: string;
    created: string[];
    message?: string;
    error?: string;
}
export declare const CueAddInputSchema: z.ZodObject<{
    feature: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type CueAddInput = z.infer<typeof CueAddInputSchema>;
export interface CueAddOutput {
    success: boolean;
    feature: string;
    added: boolean;
    message?: string;
    error?: string;
}
export declare const CueRemoveInputSchema: z.ZodObject<{
    feature: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type CueRemoveInput = z.infer<typeof CueRemoveInputSchema>;
export interface CueRemoveOutput {
    success: boolean;
    feature: string;
    removed: boolean;
    message?: string;
    error?: string;
}
export declare const CueGenerateInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type CueGenerateInput = z.infer<typeof CueGenerateInputSchema>;
export interface CueGenerateOutput {
    success: boolean;
    resolvedFeatures: string[];
    generated: string[];
    message?: string;
    error?: string;
}
export declare const CueValidateInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type CueValidateInput = z.infer<typeof CueValidateInputSchema>;
export interface CueValidateOutput {
    success: boolean;
    valid: boolean;
    features: string[];
    errors: string[];
    message?: string;
}
//# sourceMappingURL=types.d.ts.map