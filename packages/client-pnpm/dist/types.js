/**
 * Type definitions for client-pnpm procedures
 *
 * client-pnpm wraps pnpm commands as procedures using client-shell.
 */
import { z } from "zod";
// =============================================================================
// pnpm.install Types
// =============================================================================
export const PnpmInstallInputSchema = z.object({
    /** Packages to install. If not provided, installs from package.json */
    packages: z.array(z.string()).optional(),
    /** Save as dev dependency */
    dev: z.boolean().optional(),
    /** Use frozen lockfile (--frozen-lockfile) */
    frozen: z.boolean().optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// pnpm.add Types
// =============================================================================
export const PnpmAddInputSchema = z.object({
    /** Packages to add */
    packages: z.array(z.string()),
    /** Save as dev dependency */
    dev: z.boolean().optional(),
    /** Install globally */
    global: z.boolean().optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// pnpm.remove Types
// =============================================================================
export const PnpmRemoveInputSchema = z.object({
    /** Packages to remove */
    packages: z.array(z.string()),
    /** Remove from global */
    global: z.boolean().optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// pnpm.link Types
// =============================================================================
export const PnpmLinkInputSchema = z.object({
    /** Path to package to link. If not provided, links current directory globally */
    path: z.string().optional(),
    /** Link globally */
    global: z.boolean().optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// pnpm.run Types
// =============================================================================
export const PnpmRunInputSchema = z.object({
    /** Script name to run */
    script: z.string(),
    /** Additional arguments to pass to the script */
    args: z.array(z.string()).optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// pnpm.store.path Types - Get pnpm store path for snapshot/restore
// =============================================================================
export const PnpmStorePathInputSchema = z.object({
    /** Working directory (affects store path on some configurations) */
    cwd: z.string().optional(),
});
//# sourceMappingURL=types.js.map