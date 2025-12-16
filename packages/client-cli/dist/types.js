/**
 * Type definitions for client-cli procedures
 */
import { z } from "zod";
// =============================================================================
// lib.scan Types
// =============================================================================
export const LibScanInputSchema = z.object({
    /** Root path to scan for packages (defaults to ~/git) */
    rootPath: z.string().optional(),
});
// =============================================================================
// lib.refresh Types
// =============================================================================
export const LibRefreshInputSchema = z.object({
    /** Path to the library to refresh */
    path: z.string().default("."),
    /** Recursively refresh dependencies */
    recursive: z.boolean().default(false),
    /** Refresh all packages in the ecosystem */
    all: z.boolean().default(false),
    /** Non-interactive mode (auto-confirm) */
    autoConfirm: z.boolean().default(false),
    /** Session ID for log grouping */
    sessionId: z.string().optional(),
});
// =============================================================================
// lib.install Types
// =============================================================================
export const LibInstallInputSchema = z.object({
    /** Root path for packages (defaults to ~/git) */
    rootPath: z.string().optional(),
    /** Preview changes without installing */
    dryRun: z.boolean().default(false),
    /** Continue on error instead of stopping */
    continueOnError: z.boolean().default(false),
    /** Max parallel operations */
    concurrency: z.number().default(4),
});
// =============================================================================
// config.init Types
// =============================================================================
export const ConfigInitInputSchema = z.object({
    /** Project path (defaults to cwd) */
    path: z.string().optional(),
    /** Preset to use (lib, react-lib, app) */
    preset: z.string().optional(),
    /** Force overwrite existing dependencies.json */
    force: z.boolean().default(false),
});
// =============================================================================
// config.add Types
// =============================================================================
export const ConfigAddInputSchema = z.object({
    /** Feature to add */
    feature: z.string(),
    /** Project path (defaults to cwd) */
    path: z.string().optional(),
});
// =============================================================================
// config.remove Types
// =============================================================================
export const ConfigRemoveInputSchema = z.object({
    /** Feature to remove */
    feature: z.string(),
    /** Project path (defaults to cwd) */
    path: z.string().optional(),
});
// =============================================================================
// config.generate Types
// =============================================================================
export const ConfigGenerateInputSchema = z.object({
    /** Project path (defaults to cwd) */
    path: z.string().optional(),
});
// =============================================================================
// config.validate Types
// =============================================================================
export const ConfigValidateInputSchema = z.object({
    /** Project path (defaults to cwd) */
    path: z.string().optional(),
});
//# sourceMappingURL=types.js.map