/**
 * Types and schemas for cue procedures
 */
import { z } from "zod";
// =============================================================================
// cue.init
// =============================================================================
export const CueInitInputSchema = z.object({
    preset: z.string().optional().default("lib"),
    force: z.boolean().optional().default(false),
    cwd: z.string().optional(),
});
// =============================================================================
// cue.add
// =============================================================================
export const CueAddInputSchema = z.object({
    feature: z.string(),
    cwd: z.string().optional(),
});
// =============================================================================
// cue.remove
// =============================================================================
export const CueRemoveInputSchema = z.object({
    feature: z.string(),
    cwd: z.string().optional(),
});
// =============================================================================
// cue.generate
// =============================================================================
export const CueGenerateInputSchema = z.object({
    cwd: z.string().optional(),
});
// =============================================================================
// cue.validate
// =============================================================================
export const CueValidateInputSchema = z.object({
    cwd: z.string().optional(),
});
//# sourceMappingURL=types.js.map