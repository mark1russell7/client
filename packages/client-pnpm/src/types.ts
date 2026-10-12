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
  packages: z.array(z.string()).optional().describe("Packages to install. If not provided, installs from package.json"),
  /** Save as dev dependency */
  dev: z.boolean().optional().describe("Save as dev dependency"),
  /** Use frozen lockfile (--frozen-lockfile) */
  frozen: z.boolean().optional().describe("Use frozen lockfile (--frozen-lockfile)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
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
  packages: z.array(z.string()).describe("Packages to add"),
  /** Save as dev dependency */
  dev: z.boolean().optional().describe("Save as dev dependency"),
  /** Install globally */
  global: z.boolean().optional().describe("Install globally"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
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
  packages: z.array(z.string()).describe("Packages to remove"),
  /** Remove from global */
  global: z.boolean().optional().describe("Remove from global"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
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
  path: z.string().optional().describe("Path to package to link. If not provided, links current directory globally"),
  /** Link globally */
  global: z.boolean().optional().describe("Link globally"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
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
  script: z.string().describe("Script name to run"),
  /** Additional arguments to pass to the script */
  args: z.array(z.string()).optional().describe("Additional arguments to pass to the script"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmRunInput = z.infer<typeof PnpmRunInputSchema>;

// =============================================================================
// pnpm.store.path Types - Get pnpm store path for snapshot/restore
// =============================================================================

export const PnpmStorePathInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Working directory (affects store path on some configurations) */
  cwd: z.string().optional().describe("Working directory (affects store path on some configurations)"),
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

// Output schemas (roadmap 2.1). Loose objects: a field that a schema does not name stays in the
// result (a strict schema would remove it when the output is validated).

/** The result of a pnpm command: add, install, remove, link and run give it. */
export const PnpmCommandOutputSchema: z.ZodType<PnpmCommandOutput> = z.looseObject({
  exitCode: z.number().describe("The exit code of pnpm (0 is success)"),
  stdout: z.string().describe("The standard output of pnpm"),
  stderr: z.string().describe("The standard error of pnpm"),
  success: z.boolean().describe("True when the exit code is 0"),
  duration: z.number().describe("The time of the command, in milliseconds"),
});

export const PnpmStorePathOutputSchema: z.ZodType<PnpmStorePathOutput> = z.looseObject({
  path: z.string().describe("The absolute path of the pnpm store"),
  exists: z.boolean().describe("True when the store folder exists"),
  platform: z.string().describe("The platform (win32, darwin, linux)"),
});
