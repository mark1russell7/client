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
} from "@procedures/dag";

// =============================================================================
// lib.scan Types
// =============================================================================

export const LibScanInputSchema: z.ZodObject<{
  rootPath: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional().describe("Workspace root (defaults to the pnpm workspace that contains client-lib)"),
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
  /** The ecosystem dependencies (@procedures/* and @mark1russell7/*): workspace links and github: references */
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

// DAGNode extends @procedures/dag's base node (which supplies `id`, `dependencies`, and
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
  oldName: z.string().describe("Current package name to rename from"),
  /** New package name to rename to */
  newName: z.string().describe("New package name to rename to"),
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional().describe("Workspace root (defaults to the pnpm workspace that contains client-lib)"),
  /** Preview changes without applying (default: false) */
  dryRun: z.boolean().default(false).describe("Preview changes without applying (default: false)"),
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
  /** Package name (without the @procedures/ scope) */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Name must be lowercase alphanumeric with hyphens").describe("Package name (without the @procedures/ scope)"),
  /** Feature preset to use */
  preset: z.string().regex(/^[a-z][a-z0-9-]*$/, "Preset must be lowercase alphanumeric with hyphens").default("lib").describe("Feature preset to use"),
  /** Workspace root (defaults to the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional().describe("Workspace root (defaults to the pnpm workspace that contains client-lib)"),
  /** Preview changes without creating */
  dryRun: z.boolean().default(false).describe("Preview changes without creating"),
});

export type LibNewInput = z.infer<typeof LibNewInputSchema>;

export interface LibNewOutput {
  /** Whether creation succeeded */
  success: boolean;
  /** Full package name (@procedures/...) */
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
  rootPath: z.string().optional().describe("Workspace root (defaults to the pnpm workspace that contains client-lib)"),
  /** Attempt to fix issues (create missing files/dirs) */
  fix: z.boolean().default(false).describe("Attempt to fix issues (create missing files/dirs)"),
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

// The types of dag.traverse are in @procedures/dag.

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
  try: z.unknown().describe("Procedure ref to try executing. Should use $when: \"catch\" so it's not auto-executed during hydration. Example: ```json { \"$proc\": [\"git\", \"commit\"], \"input\": { \"message\": \"auto\" }, \"$when\": \"catch\" } ```"),
  /**
   * Handler procedure ref called on error.
   * Receives StepResultInfo (success, error, proc) merged with its input.
   * Should return ContinueDecision { continue: boolean }.
   */
  handler: z.unknown().optional().describe("Handler procedure ref called on error. Receives StepResultInfo (success, error, proc) merged with its input. Should return ContinueDecision { continue: boolean }."),
  /** Working directory for procedure execution */
  cwd: z.string().optional().describe("Working directory for procedure execution"),
});

export type CoreCatchInput = z.infer<typeof CoreCatchInputSchema>;

export interface CoreCatchOutput {
  /** Whether the try succeeded */
  success: boolean;
  /** Result from try (if success) or handler decision */
  result?: unknown | undefined;
  /** Error message if failed */
  error?: string | undefined;
  /** Whether execution should continue (from handler) */
  continue: boolean;
}

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema would
// remove it when the output is validated).

export const LibScanOutputSchema: z.ZodType<LibScanOutput> = z.looseObject({
  packages: z
    .record(
      z.string(),
      z.looseObject({
        name: z.string().describe("The package name"),
        repoPath: z.string().describe("The absolute path of the package folder"),
        gitRemote: z.string().optional().describe("The git remote URL of the workspace repository"),
        currentBranch: z.string().optional().describe("The current branch of the workspace repository"),
        mark1russell7Deps: z.array(z.string()).describe("The ecosystem dependencies of the package (@procedures/* and @mark1russell7/*)"),
      })
    )
    .describe("The workspace packages, by name"),
  warnings: z
    .array(z.looseObject({ path: z.string().describe("The folder"), issue: z.string().describe("The problem") }))
    .describe("The problems that the scan found"),
});

export const LibRenameOutputSchema: z.ZodType<LibRenameOutput> = z.looseObject({
  success: z.boolean().describe("True when every change succeeded"),
  changes: z
    .array(
      z.looseObject({
        type: z.enum(["package-name", "dependency", "import", "dynamic-import"]).describe("The kind of change"),
        file: z.string().describe("The file that changes"),
        field: z.string().optional().describe("The dependency field, for a dependency change"),
        line: z.number().optional().describe("The line, for an import change"),
        oldValue: z.string().describe("The old text"),
        newValue: z.string().describe("The new text"),
      })
    )
    .describe("The changes that the call made, or would make with dryRun"),
  errors: z.array(z.string()).describe("The errors"),
  summary: z
    .looseObject({
      packageNames: z.number().describe("The number of package name changes"),
      dependencies: z.number().describe("The number of dependency changes"),
      imports: z.number().describe("The number of import changes"),
      total: z.number().describe("The number of changes"),
    })
    .describe("The counts"),
});

export const LibNewOutputSchema: z.ZodType<LibNewOutput> = z.looseObject({
  success: z.boolean().describe("True when the package was made"),
  packageName: z.string().describe("The full package name (@procedures/...)"),
  packagePath: z.string().describe("The folder of the new package"),
  created: z.array(z.string()).describe("The files that the call made"),
  operations: z.array(z.string()).describe("The steps that the call ran"),
  errors: z.array(z.string()).describe("The errors"),
});

export const LibAuditOutputSchema: z.ZodType<LibAuditOutput> = z.looseObject({
  success: z.boolean().describe("True when every package passes the audit"),
  flagNotices: z
    .array(
      z.looseObject({
        procedure: z.string().describe('The procedure path, for example "docker compose down"'),
        flag: z.string().describe('The flag of the procedure, for example "-v"'),
        global: z.string().describe('The global flag of mark that it hides, for example "-v (--version)"'),
      })
    )
    .describe("Procedure flags that hide a global flag of mark after the command path (information only)"),
  template: z
    .looseObject({
      files: z.array(z.string()).describe("The files that each package needs"),
      dirs: z.array(z.string()).describe("The folders that each package needs"),
    })
    .describe("The template of the audit"),
  results: z
    .array(
      z.looseObject({
        name: z.string().describe("The package name"),
        path: z.string().describe("The package folder"),
        valid: z.boolean().describe("True when the package passes"),
        missingFiles: z.array(z.string()).describe("The required files that are missing"),
        missingDirs: z.array(z.string()).describe("The required folders that are missing"),
        pnpmIssues: z
          .array(
            z.looseObject({
              type: z
                .enum(["npm-lockfile", "package-lockfile", "ignored-pnpm-field", "not-workspace-link"])
                .describe("The kind of pnpm problem"),
              message: z.string().describe("The problem"),
              package: z.string().optional().describe("The dependency that the problem is about"),
            })
          )
          .describe("The pnpm configuration problems"),
        fixedFiles: z.array(z.string()).optional().describe("The files that fix made"),
        fixedDirs: z.array(z.string()).optional().describe("The folders that fix made"),
      })
    )
    .describe("The result of each package"),
  summary: z
    .looseObject({
      total: z.number().describe("The number of packages"),
      valid: z.number().describe("The number of packages that pass"),
      invalid: z.number().describe("The number of packages that fail"),
    })
    .describe("The counts"),
});

export const CoreCatchOutputSchema: z.ZodType<CoreCatchOutput> = z.looseObject({
  success: z.boolean().describe("True when the try operand succeeded"),
  result: z.unknown().optional().describe("The result of try, or the decision of the handler"),
  error: z.string().optional().describe("The error of try, when it failed"),
  continue: z.boolean().describe("True when the caller can continue"),
});

// =============================================================================
// lib.graph Types (roadmap R44)
// =============================================================================

/** The fields of package.json that give the edges of the graph. */
export type DependencyKind = "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";

export interface LibGraphInput {
  /** The workspace root (default: the pnpm workspace that contains client-lib) */
  rootPath?: string | undefined;
}

export interface LibGraphNode {
  /** The name in package.json */
  name: string;
  /** The folder in packages/ */
  folder: string;
  version?: string | undefined;
  private?: boolean | undefined;
}

export interface LibGraphEdge {
  /** The package that depends */
  from: string;
  /** The package that it depends on */
  to: string;
  kind: DependencyKind;
  /** The specifier, for example workspace:* */
  spec: string;
}

export interface LibGraphOutput {
  /** The workspace root */
  root: string;
  nodes: LibGraphNode[];
  edges: LibGraphEdge[];
  /** True when the graph has no cycle */
  acyclic: boolean;
  /** Each cycle: the packages of a strongly connected component, in name order */
  cycles: string[][];
  /** Without a cycle: the packages in levels. Level 0 depends on no workspace package. */
  levels?: string[][] | undefined;
  /** The folders that the procedure could not read */
  warnings: Array<{ path: string; issue: string }>;
}

export const LibGraphInputSchema: z.ZodType<LibGraphInput> = z.object({
  rootPath: z.string().optional().describe("The workspace root (default: the pnpm workspace that contains client-lib)"),
});

const DEPENDENCY_KINDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

export const LibGraphOutputSchema: z.ZodType<LibGraphOutput> = z.looseObject({
  root: z.string().describe("The workspace root"),
  nodes: z
    .array(
      z.looseObject({
        name: z.string().describe("The name in package.json"),
        folder: z.string().describe("The folder in packages/"),
        version: z.string().optional().describe("The version in package.json"),
        private: z.boolean().optional().describe("True for a private package"),
      })
    )
    .describe("The workspace packages, in name order"),
  edges: z
    .array(
      z.looseObject({
        from: z.string().describe("The package that depends"),
        to: z.string().describe("The package that it depends on"),
        kind: z.enum(DEPENDENCY_KINDS).describe("The field of package.json"),
        spec: z.string().describe("The specifier, for example workspace:*"),
      })
    )
    .describe("The workspace: dependencies between the packages"),
  acyclic: z.boolean().describe("True when the graph has no cycle"),
  cycles: z.array(z.array(z.string())).describe("Each cycle: the packages of a strongly connected component, in name order"),
  levels: z.array(z.array(z.string())).optional().describe("Without a cycle: the packages in levels. Level 0 depends on no workspace package."),
  warnings: z
    .array(z.looseObject({ path: z.string().describe("The folder"), issue: z.string().describe("The problem") }))
    .describe("The folders that the procedure could not read"),
});
