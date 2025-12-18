/**
 * Type definitions for client-git procedures
 */
import { z } from "zod";
export declare const GitStatusInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    short: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;
export interface GitStatusFile {
    path: string;
    status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "ignored";
    staged: boolean;
}
export interface GitStatusOutput {
    branch: string;
    ahead: number;
    behind: number;
    files: GitStatusFile[];
    clean: boolean;
}
export declare const GitAddInputSchema: z.ZodObject<{
    paths: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitAddInput = z.infer<typeof GitAddInputSchema>;
export interface GitAddOutput {
    staged: string[];
}
export declare const GitCommitInputSchema: z.ZodObject<{
    message: z.ZodString;
    all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    amend: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;
export interface GitCommitOutput {
    hash: string;
    message: string;
    author: string;
    date: string;
}
export declare const GitPushInputSchema: z.ZodObject<{
    remote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    branch: z.ZodOptional<z.ZodString>;
    force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    setUpstream: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitPushInput = z.infer<typeof GitPushInputSchema>;
export interface GitPushOutput {
    remote: string;
    branch: string;
    commits: number;
}
export declare const GitPullInputSchema: z.ZodObject<{
    remote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    branch: z.ZodOptional<z.ZodString>;
    rebase: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitPullInput = z.infer<typeof GitPullInputSchema>;
export interface GitPullOutput {
    remote: string;
    branch: string;
    commits: number;
    fastForward: boolean;
}
export declare const GitCloneInputSchema: z.ZodObject<{
    url: z.ZodString;
    dest: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    depth: z.ZodOptional<z.ZodNumber>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitCloneInput = z.infer<typeof GitCloneInputSchema>;
export interface GitCloneOutput {
    path: string;
    branch: string;
}
export declare const GitCheckoutInputSchema: z.ZodObject<{
    ref: z.ZodString;
    create: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitCheckoutInput = z.infer<typeof GitCheckoutInputSchema>;
export interface GitCheckoutOutput {
    ref: string;
    created: boolean;
}
export declare const GitBranchInputSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    delete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    list: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    remote: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitBranchInput = z.infer<typeof GitBranchInputSchema>;
export interface GitBranchInfo {
    name: string;
    current: boolean;
    remote: boolean;
    tracking?: string;
}
export interface GitBranchOutput {
    branches?: GitBranchInfo[];
    created?: string;
    deleted?: string;
    current: string;
}
export declare const GitLogInputSchema: z.ZodObject<{
    count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    oneline: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    ref: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitLogInput = z.infer<typeof GitLogInputSchema>;
export interface GitLogCommit {
    hash: string;
    shortHash: string;
    author: string;
    email: string;
    date: string;
    message: string;
}
export interface GitLogOutput {
    commits: GitLogCommit[];
}
export declare const GitDiffInputSchema: z.ZodObject<{
    staged: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    ref: z.ZodOptional<z.ZodString>;
    paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
    stat: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export interface GitDiffFile {
    path: string;
    additions: number;
    deletions: number;
}
export interface GitDiffOutput {
    files: GitDiffFile[];
    additions: number;
    deletions: number;
    diff?: string;
}
export declare const GitInitInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    bare: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    initialBranch: z.ZodOptional<z.ZodString>;
}>;
export type GitInitInput = z.infer<typeof GitInitInputSchema>;
export interface GitInitOutput {
    /** The initialized repository path */
    path: string;
    /** Whether the repo was newly created */
    created: boolean;
}
export declare const GitRemoteInputSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    url: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitRemoteInput = z.infer<typeof GitRemoteInputSchema>;
export interface GitRemoteOutput {
    /** Remote name */
    name: string;
    /** Remote URL */
    url: string;
}
export declare const GitFetchInputSchema: z.ZodObject<{
    remote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    branch: z.ZodOptional<z.ZodString>;
    all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    prune: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;
export interface GitFetchOutput {
    remote: string;
    fetched: boolean;
}
//# sourceMappingURL=types.d.ts.map