/**
 * Type definitions for client-lib procedures
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
// lib.rename Types
// =============================================================================
export const LibRenameInputSchema = z.object({
    /** Current package name to rename from */
    oldName: z.string(),
    /** New package name to rename to */
    newName: z.string(),
    /** Root path to scan (defaults to ~/git) */
    rootPath: z.string().optional(),
    /** Preview changes without applying (default: false) */
    dryRun: z.boolean().default(false),
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
// lib.pull Types
// =============================================================================
export const LibPullInputSchema = z.object({
    /** Root path for packages (defaults to ~/git) */
    rootPath: z.string().optional(),
    /** Remote name (default: origin) */
    remote: z.string().default("origin"),
    /** Rebase instead of merge (default: false) */
    rebase: z.boolean().default(false),
    /** Preview changes without pulling */
    dryRun: z.boolean().default(false),
    /** Continue on error instead of stopping */
    continueOnError: z.boolean().default(false),
    /** Max parallel operations */
    concurrency: z.number().default(4),
});
// =============================================================================
// dag.traverse Types
// =============================================================================
/**
 * Schema for $proc references with $when control.
 */
const ProcRefSchema = z.object({
    $proc: z.array(z.string()),
    input: z.unknown().optional(),
    $when: z.string().optional(),
    $name: z.string().optional(),
});
export const DagTraverseInputSchema = z.object({
    /**
     * Procedure to execute for each node.
     * - Array: procedure path, e.g., ["git", "add"]
     * - $proc with $when: "$never" or "$parent": deferred, executed per-node
     *
     * Example:
     * ```json
     * { "$proc": ["git", "add"], "input": { "all": true }, "$when": "$parent" }
     * ```
     */
    visit: z.union([
        z.array(z.string()),
        ProcRefSchema,
    ]),
    /** Filter to specific package names */
    filter: z.array(z.string()).optional(),
    /** Start from specific root package */
    root: z.string().optional(),
    /** Max parallel operations (default: 4) */
    concurrency: z.number().default(4),
    /** Continue on error (default: false) */
    continueOnError: z.boolean().default(false),
    /** Preview without executing (default: false) */
    dryRun: z.boolean().default(false),
});
//# sourceMappingURL=types.js.map