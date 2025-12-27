/**
 * Type definitions for client-node procedures
 */
import { z } from "zod";
export declare const NodeRunInputSchema: z.ZodObject<{
    script: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type NodeRunInput = z.infer<typeof NodeRunInputSchema>;
export interface NodeRunOutput {
    /** Exit code of the process */
    exitCode: number;
    /** Standard output */
    stdout: string;
    /** Standard error */
    stderr: string;
}
export declare const NodeSpawnInputSchema: z.ZodObject<{
    script: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    ready: z.ZodOptional<z.ZodObject<{
        pattern: z.ZodString;
        timeout: z.ZodOptional<z.ZodNumber>;
    }>>;
}>;
export type NodeSpawnInput = z.infer<typeof NodeSpawnInputSchema>;
export interface NodeSpawnOutput {
    /** Unique process identifier for management */
    processId: string;
    /** OS process ID */
    pid: number;
}
export declare const NodeKillInputSchema: z.ZodObject<{
    processId: z.ZodString;
    signal: z.ZodOptional<z.ZodString>;
}>;
export type NodeKillInput = z.infer<typeof NodeKillInputSchema>;
export interface NodeKillOutput {
    /** Whether the kill was successful */
    success: boolean;
    /** Exit code if process exited */
    exitCode?: number | undefined;
}
export declare const NodeStatusInputSchema: z.ZodObject<{
    processId: z.ZodOptional<z.ZodString>;
}>;
export type NodeStatusInput = z.infer<typeof NodeStatusInputSchema>;
export interface ProcessInfo {
    /** Process identifier */
    processId: string;
    /** OS process ID */
    pid: number;
    /** Script path */
    script: string;
    /** Current status */
    status: "running" | "exited" | "error";
    /** Exit code if exited */
    exitCode?: number | undefined;
    /** Start time */
    startedAt: string;
    /** Exit time if exited */
    exitedAt?: string | undefined;
}
export interface NodeStatusOutput {
    /** List of processes */
    processes: ProcessInfo[];
}
//# sourceMappingURL=types.d.ts.map