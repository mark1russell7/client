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

/** The result of a pnpm command that writes JSON: `data` is its parsed standard output. */
export interface PnpmJsonOutput extends PnpmCommandOutput {
  /** The parsed JSON of the standard output. It is absent when the output is not JSON. */
  data?: unknown;
}

// =============================================================================
// The selection of the workspace packages (roadmap R41)
// =============================================================================

/** `--filter=<selector>` for each selector: pnpm runs the command in the packages that match. */
const FILTER = z
  .array(z.string())
  .optional()
  .describe("Run in the workspace packages that these pnpm selectors match, for example @scope/app or ./packages/** (--filter)");

/** `--recursive`: pnpm runs the command in each package of the workspace. */
const RECURSIVE = z.boolean().optional().describe("Run in each package of the workspace (--recursive)");

// =============================================================================
// pnpm.install Types
// =============================================================================

export const PnpmInstallInputSchema: z.ZodObject<{
  packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
  dev: z.ZodOptional<z.ZodBoolean>;
  frozen: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Packages to install. If not provided, installs from package.json */
  packages: z.array(z.string()).optional().describe("Packages to install. If not provided, installs from package.json"),
  /** Save as dev dependency */
  dev: z.boolean().optional().describe("Save as dev dependency"),
  /** Use frozen lockfile (--frozen-lockfile) */
  frozen: z.boolean().optional().describe("Use frozen lockfile (--frozen-lockfile)"),
  filter: FILTER,
  recursive: RECURSIVE,
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
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Packages to add */
  packages: z.array(z.string()).describe("Packages to add"),
  /** Save as dev dependency */
  dev: z.boolean().optional().describe("Save as dev dependency"),
  /** Install globally */
  global: z.boolean().optional().describe("Install globally"),
  filter: FILTER,
  recursive: RECURSIVE,
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
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Packages to remove */
  packages: z.array(z.string()).describe("Packages to remove"),
  /** Remove from global */
  global: z.boolean().optional().describe("Remove from global"),
  filter: FILTER,
  recursive: RECURSIVE,
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
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Script name to run */
  script: z.string().describe("Script name to run"),
  /** Additional arguments to pass to the script */
  args: z.array(z.string()).optional().describe("Additional arguments to pass to the script"),
  filter: FILTER,
  recursive: RECURSIVE,
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

/** The result of a pnpm command that writes JSON: list, why, outdated and pack give it. */
export const PnpmJsonOutputSchema: z.ZodType<PnpmJsonOutput> = z.looseObject({
  exitCode: z.number().describe("The exit code of pnpm (0 is success)"),
  stdout: z.string().describe("The standard output of pnpm"),
  stderr: z.string().describe("The standard error of pnpm"),
  success: z.boolean().describe("True when the command succeeded"),
  duration: z.number().describe("The time of the command, in milliseconds"),
  data: z.unknown().optional().describe("The parsed JSON of the standard output, when it is JSON"),
});

// =============================================================================
// pnpm.exec Types - Run a program of the dependencies (roadmap R41)
// =============================================================================

export const PnpmExecInputSchema: z.ZodObject<{
  command: z.ZodString;
  args: z.ZodOptional<z.ZodArray<z.ZodString>>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  command: z.string().describe("The program, for example tsc or eslint. pnpm finds it in node_modules/.bin"),
  args: z.array(z.string()).optional().describe("The arguments of the program. No shell reads them"),
  filter: FILTER,
  recursive: RECURSIVE,
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmExecInput = z.infer<typeof PnpmExecInputSchema>;

export type PnpmExecOutput = PnpmCommandOutput;

export const PnpmExecOutputSchema: z.ZodType<PnpmExecOutput> = PnpmCommandOutputSchema;

// =============================================================================
// pnpm.list Types - The installed packages as JSON (roadmap R41)
// =============================================================================

export const PnpmListInputSchema: z.ZodObject<{
  packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
  depth: z.ZodOptional<z.ZodNumber>;
  prod: z.ZodOptional<z.ZodBoolean>;
  dev: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  packages: z.array(z.string()).optional().describe("List only these packages (names or patterns)"),
  depth: z.number().int().min(0).optional().describe("The depth of the dependency tree (default: 0, the direct dependencies)"),
  prod: z.boolean().optional().describe("Only the dependencies, not the dev dependencies (--prod)"),
  dev: z.boolean().optional().describe("Only the dev dependencies (--dev)"),
  filter: FILTER,
  recursive: RECURSIVE,
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmListInput = z.infer<typeof PnpmListInputSchema>;

export type PnpmListOutput = PnpmJsonOutput;

export const PnpmListOutputSchema: z.ZodType<PnpmListOutput> = PnpmJsonOutputSchema;

// =============================================================================
// pnpm.why Types - Why a package is installed (roadmap R41)
// =============================================================================

export const PnpmWhyInputSchema: z.ZodObject<{
  packages: z.ZodArray<z.ZodString>;
  depth: z.ZodOptional<z.ZodNumber>;
  prod: z.ZodOptional<z.ZodBoolean>;
  dev: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  packages: z.array(z.string()).min(1).describe("The packages (names or patterns)"),
  depth: z.number().int().min(0).optional().describe("The depth of the dependency tree"),
  prod: z.boolean().optional().describe("Only the dependencies, not the dev dependencies (--prod)"),
  dev: z.boolean().optional().describe("Only the dev dependencies (--dev)"),
  filter: FILTER,
  recursive: RECURSIVE,
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmWhyInput = z.infer<typeof PnpmWhyInputSchema>;

export type PnpmWhyOutput = PnpmJsonOutput;

export const PnpmWhyOutputSchema: z.ZodType<PnpmWhyOutput> = PnpmJsonOutputSchema;

// =============================================================================
// pnpm.outdated Types - The outdated packages (roadmap R41)
// =============================================================================

export const PnpmOutdatedInputSchema: z.ZodObject<{
  packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
  prod: z.ZodOptional<z.ZodBoolean>;
  dev: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  packages: z.array(z.string()).optional().describe("Examine only these packages (names or patterns)"),
  prod: z.boolean().optional().describe("Only the dependencies, not the dev dependencies (--prod)"),
  dev: z.boolean().optional().describe("Only the dev dependencies (--dev)"),
  filter: FILTER,
  recursive: RECURSIVE,
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmOutdatedInput = z.infer<typeof PnpmOutdatedInputSchema>;

export type PnpmOutdatedOutput = PnpmJsonOutput;

export const PnpmOutdatedOutputSchema: z.ZodType<PnpmOutdatedOutput> = PnpmJsonOutputSchema;

// =============================================================================
// pnpm.update Types - Update packages (roadmap R41)
// =============================================================================

export const PnpmUpdateInputSchema: z.ZodObject<{
  packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
  latest: z.ZodOptional<z.ZodBoolean>;
  prod: z.ZodOptional<z.ZodBoolean>;
  dev: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  recursive: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  packages: z.array(z.string()).optional().describe("Update only these packages (names or patterns). Default: all"),
  latest: z.boolean().optional().describe("Update to the latest versions, also out of the ranges of package.json (--latest)"),
  prod: z.boolean().optional().describe("Only the dependencies, not the dev dependencies (--prod)"),
  dev: z.boolean().optional().describe("Only the dev dependencies (--dev)"),
  filter: FILTER,
  recursive: RECURSIVE,
  cwd: z.string().optional().describe("Working directory"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmUpdateInput = z.infer<typeof PnpmUpdateInputSchema>;

export type PnpmUpdateOutput = PnpmCommandOutput;

export const PnpmUpdateOutputSchema: z.ZodType<PnpmUpdateOutput> = PnpmCommandOutputSchema;

// =============================================================================
// pnpm.pack Types - A tarball of the package (roadmap R41)
// =============================================================================

export const PnpmPackInputSchema: z.ZodObject<{
  destination: z.ZodOptional<z.ZodString>;
  dryRun: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  destination: z.string().optional().describe("The folder of the tarball (default: the folder of the package)"),
  dryRun: z.boolean().optional().describe("Give the files of the tarball, and write no tarball (--dry-run, default: false)"),
  cwd: z.string().optional().describe("The folder of the package"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type PnpmPackInput = z.infer<typeof PnpmPackInputSchema>;

export type PnpmPackOutput = PnpmJsonOutput;

export const PnpmPackOutputSchema: z.ZodType<PnpmPackOutput> = PnpmJsonOutputSchema;
