/**
 * Type definitions for client-lib procedures
 */
import { z } from "zod";
export declare const LibScanInputSchema: z.ZodObject<{
    rootPath: z.ZodOptional<z.ZodString>;
}>;
export type LibScanInput = z.infer<typeof LibScanInputSchema>;
export interface PackageInfo {
    /** Package name from package.json */
    name: string;
    /** Absolute path to the repo */
    repoPath: string;
    /** Git remote URL if available */
    gitRemote?: string | undefined;
    /** Current branch */
    currentBranch?: string | undefined;
    /** mark1russell7 dependencies (package names) */
    mark1russell7Deps: string[];
}
export interface LibScanOutput {
    /** Map of package name to package info */
    packages: Record<string, PackageInfo>;
    /** Warnings for any issues found */
    warnings: Array<{
        path: string;
        issue: string;
    }>;
}
export declare const LibRefreshInputSchema: z.ZodObject<{
    path: z.ZodDefault<z.ZodString>;
    recursive: z.ZodDefault<z.ZodBoolean>;
    all: z.ZodDefault<z.ZodBoolean>;
    force: z.ZodDefault<z.ZodBoolean>;
    skipGit: z.ZodDefault<z.ZodBoolean>;
    autoConfirm: z.ZodDefault<z.ZodBoolean>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
    sessionId: z.ZodOptional<z.ZodString>;
}>;
export type LibRefreshInput = z.infer<typeof LibRefreshInputSchema>;
export interface RefreshResult {
    /** Package name */
    name: string;
    /** Package path */
    path: string;
    /** Whether refresh succeeded */
    success: boolean;
    /** Duration in milliseconds */
    duration: number;
    /** Error if failed */
    error?: string | undefined;
    /** Phase where failure occurred */
    failedPhase?: "cleanup" | "install" | "build" | "git" | undefined;
    /** Planned operations (for dry-run mode) */
    plannedOperations?: string[] | undefined;
}
export interface LibRefreshOutput {
    /** Overall success */
    success: boolean;
    /** Results for each package refreshed */
    results: RefreshResult[];
    /** Total duration in milliseconds */
    totalDuration: number;
}
export interface DAGNode {
    /** Package name (e.g., "@mark1russell7/logger") */
    name: string;
    /** Path to the repo */
    repoPath: string;
    /** Git ref from package.json (e.g., "github:mark1russell7/logger#main") */
    gitRef: string;
    /** Required branch from git ref */
    requiredBranch: string;
    /** Dependencies (other package names in DAG) */
    dependencies: string[];
    /** Topological level (0 = leaves, computed by Kahn's algorithm) */
    level?: number | undefined;
}
export interface DependencyDAG {
    /** All nodes in the DAG */
    nodes: Map<string, DAGNode>;
    /** Nodes grouped by level for parallel execution */
    levels: DAGNode[][];
    /** Root nodes (no dependents in the DAG) */
    roots: string[];
    /** Leaf nodes (no dependencies in the DAG) */
    leaves: string[];
}
export interface DAGExecutionOptions {
    /** Max parallel operations per level */
    concurrency?: number | undefined;
    /** Stop on first error vs continue */
    failFast?: boolean | undefined;
    /** Callback for progress reporting */
    onNodeStart?: ((node: DAGNode) => void) | undefined;
    /** Callback when a node completes */
    onNodeComplete?: ((result: NodeResult) => void) | undefined;
}
export interface NodeResult {
    /** The node that was processed */
    node: DAGNode;
    /** Whether processing succeeded */
    success: boolean;
    /** Error if failed */
    error?: Error | undefined;
    /** Duration in milliseconds */
    duration: number;
    /** Logs from processing */
    logs: string[];
}
export interface DAGResult {
    /** Overall success */
    success: boolean;
    /** Results for each node */
    results: Map<string, NodeResult>;
    /** Names of failed nodes */
    failedNodes: string[];
    /** Total duration in milliseconds */
    totalDuration: number;
}
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
export declare const LibRenameInputSchema: z.ZodObject<{
    oldName: z.ZodString;
    newName: z.ZodString;
    rootPath: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}>;
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
export declare const LibInstallInputSchema: z.ZodObject<{
    rootPath: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
    continueOnError: z.ZodDefault<z.ZodBoolean>;
    concurrency: z.ZodDefault<z.ZodNumber>;
}>;
export type LibInstallInput = z.infer<typeof LibInstallInputSchema>;
export interface InstallResult {
    /** Package name */
    name: string;
    /** Package path */
    path: string;
    /** Whether install succeeded */
    success: boolean;
    /** Duration in milliseconds */
    duration: number;
    /** Current phase when completed/failed */
    phase?: "clone" | "install" | "build" | "complete" | undefined;
    /** Error if failed */
    error?: string | undefined;
}
export interface LibInstallOutput {
    /** Overall success */
    success: boolean;
    /** Packages that were cloned */
    cloned: string[];
    /** Packages that already existed */
    skipped: string[];
    /** Install results for each package */
    results: InstallResult[];
    /** Any errors encountered */
    errors: string[];
    /** Total duration in milliseconds */
    totalDuration: number;
}
export declare const LibNewInputSchema: z.ZodObject<{
    name: z.ZodString;
    preset: z.ZodDefault<z.ZodString>;
    rootPath: z.ZodOptional<z.ZodString>;
    skipGit: z.ZodDefault<z.ZodBoolean>;
    skipManifest: z.ZodDefault<z.ZodBoolean>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}>;
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
export declare const LibAuditInputSchema: z.ZodObject<{
    rootPath: z.ZodOptional<z.ZodString>;
    fix: z.ZodDefault<z.ZodBoolean>;
}>;
export type LibAuditInput = z.infer<typeof LibAuditInputSchema>;
export interface PnpmIssue {
    /** Type of pnpm issue */
    type: "missing-onlyBuiltDependencies" | "npm-lockfile" | "missing-pnpm-config";
    /** Description of the issue */
    message: string;
    /** Package that needs to be added to onlyBuiltDependencies */
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
export interface LibAuditOutput {
    /** Overall success (all packages valid) */
    success: boolean;
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
export declare const LibPullInputSchema: z.ZodObject<{
    rootPath: z.ZodOptional<z.ZodString>;
    remote: z.ZodDefault<z.ZodString>;
    rebase: z.ZodDefault<z.ZodBoolean>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
    continueOnError: z.ZodDefault<z.ZodBoolean>;
    concurrency: z.ZodDefault<z.ZodNumber>;
}>;
export type LibPullInput = z.infer<typeof LibPullInputSchema>;
export interface PullResult {
    /** Package name */
    name: string;
    /** Package path */
    path: string;
    /** Whether pull succeeded */
    success: boolean;
    /** Duration in milliseconds */
    duration: number;
    /** Number of commits pulled */
    commits: number;
    /** Whether it was a fast-forward */
    fastForward?: boolean | undefined;
    /** Error if failed */
    error?: string | undefined;
    /** Planned operations (for dry-run mode) */
    plannedOperations?: string[] | undefined;
}
export interface LibPullOutput {
    /** Overall success */
    success: boolean;
    /** Pull results for each package */
    results: PullResult[];
    /** Total duration in milliseconds */
    totalDuration: number;
}
export declare const DagTraverseInputSchema: z.ZodObject<{
    visit: z.ZodUnion<[z.ZodArray<z.ZodString>, z.ZodObject<{
        $proc: z.ZodArray<z.ZodString>;
        input: z.ZodOptional<z.ZodUnknown>;
    }>]>;
    filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
    root: z.ZodOptional<z.ZodString>;
    concurrency: z.ZodDefault<z.ZodNumber>;
    continueOnError: z.ZodDefault<z.ZodBoolean>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}>;
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
//# sourceMappingURL=types.d.ts.map