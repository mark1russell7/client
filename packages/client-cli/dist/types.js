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
    /** Force full cleanup (rm node_modules, dist, lock) before install */
    force: z.boolean().default(false),
    /** Skip git commit/push */
    skipGit: z.boolean().default(false),
    /** Non-interactive mode (auto-confirm) */
    autoConfirm: z.boolean().default(false),
    /** Preview changes without applying */
    dryRun: z.boolean().default(false),
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
// lib.new Types
// =============================================================================
export const LibNewInputSchema = z.object({
    /** Package name (without @mark1russell7/ prefix) */
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Name must be lowercase alphanumeric with hyphens"),
    /** Feature preset to use */
    preset: z.string().default("lib"),
    /** Root path for packages (defaults to ~/git) */
    rootPath: z.string().optional(),
    /** Skip git init and GitHub repo creation */
    skipGit: z.boolean().default(false),
    /** Skip adding to ecosystem manifest */
    skipManifest: z.boolean().default(false),
    /** Preview changes without creating */
    dryRun: z.boolean().default(false),
});
// =============================================================================
// lib.audit Types
// =============================================================================
export const LibAuditInputSchema = z.object({
    /** Root path for packages (defaults to ~/git) */
    rootPath: z.string().optional(),
    /** Attempt to fix issues (create missing files/dirs) */
    fix: z.boolean().default(false),
});
// =============================================================================
// procedure.new Types
// =============================================================================
export const ProcedureNewInputSchema = z.object({
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
//# sourceMappingURL=types.js.map