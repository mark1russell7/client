/**
 * Type definitions for client-node procedures
 */

import { z } from "zod";

// ============================================================================
// node.run - Run script and wait for completion
// ============================================================================

export const NodeRunInputSchema: z.ZodObject<{
  script: z.ZodString;
  args: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Script path to run */
  script: z.string(),
  /** Arguments to pass to the script */
  args: z.array(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type NodeRunInput = z.infer<typeof NodeRunInputSchema>;

export interface NodeRunOutput {
  /** Exit code of the process */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

// ============================================================================
// node.spawn - Spawn long-running process
// ============================================================================

export const NodeSpawnInputSchema: z.ZodObject<{
  script: z.ZodString;
  args: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  ready: z.ZodOptional<z.ZodObject<{
    pattern: z.ZodString;
    timeout: z.ZodOptional<z.ZodNumber>;
  }>>;
}> = z.object({
  /** Script path to run */
  script: z.string(),
  /** Arguments to pass to the script */
  args: z.array(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Ready pattern - wait for this in stdout before returning */
  ready: z
    .object({
      pattern: z.string(),
      timeout: z.number().optional(),
    })
    .optional(),
});

export type NodeSpawnInput = z.infer<typeof NodeSpawnInputSchema>;

export interface NodeSpawnOutput {
  /** Unique process identifier for management */
  processId: string;
  /** OS process ID */
  pid: number;
}

// ============================================================================
// node.kill - Kill a spawned process
// ============================================================================

export const NodeKillInputSchema: z.ZodObject<{
  processId: z.ZodString;
  signal: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Process ID returned from node.spawn */
  processId: z.string(),
  /** Signal to send (default: SIGTERM) */
  signal: z.string().optional(),
});

export type NodeKillInput = z.infer<typeof NodeKillInputSchema>;

export interface NodeKillOutput {
  /** Whether the kill was successful */
  success: boolean;
  /** Exit code if process exited */
  exitCode?: number | undefined;
}

// ============================================================================
// node.status - Get status of running processes
// ============================================================================

export const NodeStatusInputSchema: z.ZodObject<{
  processId: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Optional process ID to filter by */
  processId: z.string().optional(),
});

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
