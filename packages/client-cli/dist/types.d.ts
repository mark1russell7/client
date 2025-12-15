/**
 * Type definitions for client-cli procedures
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
    gitRemote?: string;
    /** Current branch */
    currentBranch?: string;
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
    autoConfirm: z.ZodDefault<z.ZodBoolean>;
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
    error?: string;
    /** Phase where failure occurred */
    failedPhase?: "cleanup" | "install" | "build" | "git";
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
    level?: number;
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
    concurrency?: number;
    /** Stop on first error vs continue */
    failFast?: boolean;
    /** Callback for progress reporting */
    onNodeStart?: (node: DAGNode) => void;
    /** Callback when a node completes */
    onNodeComplete?: (result: NodeResult) => void;
}
export interface NodeResult {
    /** The node that was processed */
    node: DAGNode;
    /** Whether processing succeeded */
    success: boolean;
    /** Error if failed */
    error?: Error;
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
export interface LibRenameInput {
    /** Current package name to rename from */
    oldName: string;
    /** New package name to rename to */
    newName: string;
    /** Root path to scan (defaults to ~/git) */
    rootPath?: string | undefined;
    /** Preview changes without applying (default: false) */
    dryRun?: boolean | undefined;
}
export interface RenameChange {
    /** Type of change */
    type: "package-name" | "dependency" | "import" | "dynamic-import";
    /** File that was changed */
    file: string;
    /** Field name (for dependency changes) */
    field?: string;
    /** Line number (for imports) */
    line?: number;
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
//# sourceMappingURL=types.d.ts.map