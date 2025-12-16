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
//# sourceMappingURL=types.js.map