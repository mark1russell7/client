/**
 * Type definitions for client-pnpm procedures
 *
 * client-pnpm wraps pnpm commands as procedures using client-shell.
 */

import { z } from "zod";

// =============================================================================
// Shared Output Type
// =============================================================================

export interface PnpmCommandOutput {
  /** Exit code of the command */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
}

// =============================================================================
// pnpm.install Types
// =============================================================================

export const PnpmInstallInputSchema: z.ZodObject<{
  packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
  dev: z.ZodOptional<z.ZodBoolean>;
  frozen: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
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

export type PnpmInstallInput = z.infer<typeof PnpmInstallInputSchema>;

// =============================================================================
// pnpm.add Types
// =============================================================================

export const PnpmAddInputSchema: z.ZodObject<{
  packages: z.ZodArray<z.ZodString>;
  dev: z.ZodOptional<z.ZodBoolean>;
  global: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
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

export type PnpmAddInput = z.infer<typeof PnpmAddInputSchema>;

// =============================================================================
// pnpm.remove Types
// =============================================================================

export const PnpmRemoveInputSchema: z.ZodObject<{
  packages: z.ZodArray<z.ZodString>;
  global: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Packages to remove */
  packages: z.array(z.string()),
  /** Remove from global */
  global: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type PnpmRemoveInput = z.infer<typeof PnpmRemoveInputSchema>;

// =============================================================================
// pnpm.link Types
// =============================================================================

export const PnpmLinkInputSchema: z.ZodObject<{
  path: z.ZodOptional<z.ZodString>;
  global: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Path to package to link. If not provided, links current directory globally */
  path: z.string().optional(),
  /** Link globally */
  global: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type PnpmLinkInput = z.infer<typeof PnpmLinkInputSchema>;

// =============================================================================
// pnpm.run Types
// =============================================================================

export const PnpmRunInputSchema: z.ZodObject<{
  script: z.ZodString;
  args: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Script name to run */
  script: z.string(),
  /** Additional arguments to pass to the script */
  args: z.array(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type PnpmRunInput = z.infer<typeof PnpmRunInputSchema>;

// =============================================================================
// pnpm.store.path Types - Get pnpm store path for snapshot/restore
// =============================================================================

export const PnpmStorePathInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Working directory (affects store path on some configurations) */
  cwd: z.string().optional(),
});

export type PnpmStorePathInput = z.infer<typeof PnpmStorePathInputSchema>;

export interface PnpmStorePathOutput {
  /** Absolute path to the pnpm store */
  path: string;
  /** Whether store exists */
  exists: boolean;
  /** Platform (win32, darwin, linux) */
  platform: string;
}
