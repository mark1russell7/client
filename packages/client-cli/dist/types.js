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
//# sourceMappingURL=types.js.map