/**
 * Type definitions for client-lib procedures
 */
import { z } from "zod";
import type { DAGNode as DagBaseNode, DependencyDAG as DagDependencyDAG, DAGExecutionOptions as DagExecutionOptions, NodeResult as DagNodeResult, DAGResult as DagResult } from "@mark1russell7/client-dag";
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
export type DependencyDAG = DagDependencyDAG<DAGNode>;
export type DAGExecutionOptions = DagExecutionOptions<DAGNode>;
export type NodeResult = DagNodeResult<DAGNode>;
export type DAGResult = DagResult<DAGNode>;
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
/**
 * Schema for $proc references with $when control.
 */
declare const ProcRefSchema: z.ZodObject<{
    $proc: z.ZodArray<z.ZodString>;
    input: z.ZodOptional<z.ZodUnknown>;
    $when: z.ZodOptional<z.ZodString>;
    $name: z.ZodOptional<z.ZodString>;
}>;
export declare const DagTraverseInputSchema: z.ZodObject<{
    visit: z.ZodUnion<[z.ZodArray<z.ZodString>, typeof ProcRefSchema]>;
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
export declare const CoreCatchInputSchema: z.ZodObject<{
    try: z.ZodUnknown;
    handler: z.ZodOptional<z.ZodUnknown>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
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
export {};
//# sourceMappingURL=types.d.ts.map