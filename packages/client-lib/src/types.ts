/**
 * Type definitions for client-lib procedures
 */

import { z } from "zod";
import type {
  DAGNode as DagBaseNode,
  DependencyDAG as DagDependencyDAG,
  DAGExecutionOptions as DagExecutionOptions,
  NodeResult as DagNodeResult,
  DAGResult as DagResult,
} from "@mark1russell7/client-dag";

// =============================================================================
// lib.scan Types
// =============================================================================

export const LibScanInputSchema: z.ZodObject<{
  rootPath: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional(),
});

export type LibScanInput = z.infer<typeof LibScanInputSchema>;

export interface PackageInfo {
  /** Package name from package.json */
  name: string;
  /** Absolute path to the package folder */
  repoPath: string;
  /** Git remote URL of the workspace repository, if available */
  gitRemote?: string | undefined;
  /** Current branch of the workspace repository */
  currentBranch?: string | undefined;
  /** @mark1russell7 dependencies (package names): workspace links and github: references */
  mark1russell7Deps: string[];
}

export interface LibScanOutput {
  /** Map of package name to package info */
  packages: Record<string, PackageInfo>;
  /** Warnings for any issues found */
  warnings: Array<{ path: string; issue: string }>;
}

// =============================================================================
// DAG Types (ecosystem-specific)
// =============================================================================

// DAGNode extends @mark1russell7/client-dag's base node (which supplies `id`, `dependencies`, and
// `level`, and keys nodes by id), adding the ecosystem-specific fields. The generic DAG algorithms
// (buildLeveledDAG/executeDAG/...) come from client-dag; only buildDAGNodes is local, and it sets
// `id` = `name`. This deduplicates a previously vendored copy. See documentation/BUGS-2026-07.md.
export interface DAGNode extends DagBaseNode {
  /** Package name (e.g., "@mark1russell7/logger"). Mirrors `id`. */
  name: string;
  /** Path to the repo */
  repoPath: string;
  /** Git ref from package.json (e.g., "github:mark1russell7/logger#main") */
  gitRef: string;
  /** Required branch from git ref */
  requiredBranch: string;
}

// Aggregate DAG types are client-dag's generics parameterized by the ecosystem node, so they line
// up structurally with what the re-exported client-dag functions accept and return.
export type DependencyDAG = DagDependencyDAG<DAGNode>;
export type DAGExecutionOptions = DagExecutionOptions<DAGNode>;
export type NodeResult = DagNodeResult<DAGNode>;
export type DAGResult = DagResult<DAGNode>;

// =============================================================================
// Git Types
// =============================================================================

export interface GitRef {
  /** Full ref string (e.g., "github:mark1russell7/logger#main") */
  raw: string;
  /** Host (github, gitlab, etc.) */
  host: string;
  /** Owner/org */
  owner: string;
  /** Repo name */
  repo: string;
  /** Branch or tag */
  ref: string;
}

export interface GitStatus {
  /** Whether the repo has uncommitted changes */
  hasUncommittedChanges: boolean;
  /** Whether there are staged changes */
  hasStagedChanges: boolean;
  /** Current branch */
  currentBranch: string;
  /** Whether the repo is clean */
  isClean: boolean;
}

// =============================================================================
// lib.rename Types
// =============================================================================

export const LibRenameInputSchema: z.ZodObject<{
  oldName: z.ZodString;
  newName: z.ZodString;
  rootPath: z.ZodOptional<z.ZodString>;
  dryRun: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /** Current package name to rename from */
  oldName: z.string(),
  /** New package name to rename to */
  newName: z.string(),
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional(),
  /** Preview changes without applying (default: false) */
  dryRun: z.boolean().default(false),
});

export type LibRenameInput = z.infer<typeof LibRenameInputSchema>;

export interface RenameChange {
  /** Type of change */
  type: "package-name" | "dependency" | "import" | "dynamic-import";
  /** File that was changed */
  file: string;
  /** Field name (for dependency changes) */
  field?: string | undefined;
  /** Line number (for imports) */
  line?: number | undefined;
  /** Old value */
  oldValue: string;
  /** New value */
  newValue: string;
}

export interface LibRenameOutput {
  /** Whether all changes succeeded */
  success: boolean;
  /** List of changes made (or would be made if dryRun) */
  changes: RenameChange[];
  /** Any errors encountered */
  errors: string[];
  /** Summary counts */
  summary: {
    packageNames: number;
    dependencies: number;
    imports: number;
    total: number;
  };
}

// =============================================================================
// lib.new Types
// =============================================================================

export const LibNewInputSchema: z.ZodObject<{
  name: z.ZodString;
  preset: z.ZodDefault<z.ZodString>;
  rootPath: z.ZodOptional<z.ZodString>;
  dryRun: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /** Package name (without @mark1russell7/ prefix) */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Name must be lowercase alphanumeric with hyphens"),
  /** Feature preset to use */
  preset: z.string().regex(/^[a-z][a-z0-9-]*$/, "Preset must be lowercase alphanumeric with hyphens").default("lib"),
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional(),
  /** Preview changes without creating */
  dryRun: z.boolean().default(false),
});

export type LibNewInput = z.infer<typeof LibNewInputSchema>;

export interface LibNewOutput {
  /** Whether creation succeeded */
  success: boolean;
  /** Full package name (@mark1russell7/...) */
  packageName: string;
  /** Path to created package */
  packagePath: string;
  /** Files created */
  created: string[];
  /** Operations performed */
  operations: string[];
  /** Any errors encountered */
  errors: string[];
}

// =============================================================================
// lib.audit Types
// =============================================================================

export const LibAuditInputSchema: z.ZodObject<{
  rootPath: z.ZodOptional<z.ZodString>;
  fix: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional(),
  /** Attempt to fix issues (create missing files/dirs) */
  fix: z.boolean().default(false),
});

export type LibAuditInput = z.infer<typeof LibAuditInputSchema>;

export interface PnpmIssue {
  /** Type of pnpm issue */
  type: "npm-lockfile" | "package-lockfile" | "ignored-pnpm-field" | "not-workspace-link";
  /** Description of the issue */
  message: string;
  /** The dependency the issue is about, if any */
  package?: string | undefined;
}

export interface PackageAuditResult {
  /** Package name */
  name: string;
  /** Package path */
  path: string;
  /** Whether package passes audit */
  valid: boolean;
  /** Missing required files */
  missingFiles: string[];
  /** Missing required directories */
  missingDirs: string[];
  /** pnpm configuration issues */
  pnpmIssues: PnpmIssue[];
  /** Files that were fixed (if fix=true) */
  fixedFiles?: string[] | undefined;
  /** Dirs that were fixed (if fix=true) */
  fixedDirs?: string[] | undefined;
}

/**
 * A procedure flag that hides a global flag of `mark` after the command path. It is not an
 * error: the user gives the global flag before the command.
 */
export interface FlagNotice {
  /** The procedure path, for example "docker compose down" */
  procedure: string;
  /** The flag of the procedure, for example "-v" */
  flag: string;
  /** The global flag that it hides, for example "-v (--version)" */
  global: string;
}

export interface LibAuditOutput {
  /** Overall success (all packages valid) */
  success: boolean;
  /** Procedure flags that hide a global flag of mark after the command path (information only) */
  flagNotices: FlagNotice[];
  /** Project template used for validation */
  template: {
    files: string[];
    dirs: string[];
  };
  /** Results per package */
  results: PackageAuditResult[];
  /** Summary counts */
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
}

// =============================================================================
// dag.traverse Types
// =============================================================================

/**
 * Schema for $proc references with $when control.
 */
const ProcRefSchema: z.ZodObject<{
  $proc: z.ZodArray<z.ZodString>;
  input: z.ZodOptional<z.ZodUnknown>;
  $when: z.ZodOptional<z.ZodString>;
  $name: z.ZodOptional<z.ZodString>;
}> = z.object({
  $proc: z.array(z.string()),
  input: z.unknown().optional(),
  $when: z.string().optional(),
  $name: z.string().optional(),
});

export const DagTraverseInputSchema: z.ZodObject<{
  visit: z.ZodUnion<[z.ZodArray<z.ZodString>, typeof ProcRefSchema]>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  root: z.ZodOptional<z.ZodString>;
  concurrency: z.ZodDefault<z.ZodNumber>;
  continueOnError: z.ZodDefault<z.ZodBoolean>;
  dryRun: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
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

export type DagTraverseInput = z.infer<typeof DagTraverseInputSchema>;

export interface TraverseNodeResult {
  name: string;
  path: string;
  success: boolean;
  duration: number;
  error?: string | undefined;
  output?: unknown | undefined;
}

export interface DagTraverseOutput {
  success: boolean;
  results: TraverseNodeResult[];
  totalDuration: number;
  visited: number;
  failed: number;
}

// =============================================================================
// core.catch Types
// =============================================================================

export const CoreCatchInputSchema: z.ZodObject<{
  try: z.ZodUnknown;
  handler: z.ZodOptional<z.ZodUnknown>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /**
   * Procedure ref to try executing.
   * Should use $when: "catch" so it's not auto-executed during hydration.
   *
   * Example:
   * ```json
   * { "$proc": ["git", "commit"], "input": { "message": "auto" }, "$when": "catch" }
   * ```
   */
  try: z.unknown(),
  /**
   * Handler procedure ref called on error.
   * Receives StepResultInfo (success, error, proc) merged with its input.
   * Should return ContinueDecision { continue: boolean }.
   */
  handler: z.unknown().optional(),
  /** Working directory for procedure execution */
  cwd: z.string().optional(),
});

export type CoreCatchInput = z.infer<typeof CoreCatchInputSchema>;

export interface CoreCatchOutput {
  /** Whether the try succeeded */
  success: boolean;
  /** Result from try (if success) or handler decision */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Whether execution should continue (from handler) */
  continue: boolean;
}
