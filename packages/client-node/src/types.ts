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
  maxOutputBytes: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Script path to run */
  script: z.string().describe("Script path to run"),
  /** Arguments to pass to the script */
  args: z.array(z.string()).optional().describe("Arguments to pass to the script"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
  /** Timeout in milliseconds. At the timeout, the script and its child processes are killed. */
  timeout: z.number().optional().describe("Timeout in milliseconds. At the timeout, the script and its child processes are killed."),
  /** The most bytes kept of each output stream (default: 64 MiB). The procedure keeps the first bytes. */
  maxOutputBytes: z.number().int().positive().optional().describe("The most bytes kept of each output stream (default: 64 MiB). The procedure keeps the first bytes."),
});

export type NodeRunInput = z.infer<typeof NodeRunInputSchema>;

export interface NodeRunOutput {
  /** Exit code of the process */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** True when an output stream was longer than `maxOutputBytes` */
  truncated?: boolean | undefined;
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
  script: z.string().describe("Script path to run"),
  /** Arguments to pass to the script */
  args: z.array(z.string()).optional().describe("Arguments to pass to the script"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
  /** Ready pattern - wait for this in stdout before returning */
  ready: z
    .object({
      pattern: z.string(),
      timeout: z.number().optional(),
    })
    .optional().describe("Ready pattern - wait for this in stdout before returning"),
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
  processId: z.string().describe("Process ID returned from node.spawn"),
  /** Signal to send (default: SIGTERM) */
  signal: z.string().optional().describe("Signal to send (default: SIGTERM)"),
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
  output: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  /** Optional process ID to filter by */
  processId: z.string().optional().describe("Optional process ID to filter by"),
  /** Also give the end of the output of each process (the last 64 KiB) */
  output: z.boolean().optional().describe("Also give the end of the output of each process (the last 64 KiB)"),
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
  /** With `output: true`, the end of the output */
  output?: string | undefined;
}

export interface NodeStatusOutput {
  /** List of processes */
  processes: ProcessInfo[];
}

// Output schemas (roadmap 2.1). Loose objects: a field that a schema does not name stays in the
// result (a strict schema would remove it when the output is validated).

export const NodeRunOutputSchema: z.ZodType<NodeRunOutput> = z.looseObject({
  exitCode: z.number().describe("The exit code of the script"),
  stdout: z.string().describe("The standard output"),
  stderr: z.string().describe("The standard error"),
  truncated: z.boolean().optional().describe("True when an output stream was longer than maxOutputBytes"),
});

export const NodeSpawnOutputSchema: z.ZodType<NodeSpawnOutput> = z.looseObject({
  processId: z.string().describe("The id of the process: node.kill and node.status take it"),
  pid: z.number().describe("The process id of the operating system"),
});

export const NodeKillOutputSchema: z.ZodType<NodeKillOutput> = z.looseObject({
  success: z.boolean().describe("True when the process ended"),
  exitCode: z.number().optional().describe("The exit code, when the process exited"),
});

export const NodeStatusOutputSchema: z.ZodType<NodeStatusOutput> = z.looseObject({
  processes: z
    .array(
      z.looseObject({
        processId: z.string().describe("The id of the process"),
        pid: z.number().describe("The process id of the operating system"),
        script: z.string().describe("The script"),
        status: z.enum(["running", "exited", "error"]).describe("The state of the process"),
        exitCode: z.number().optional().describe("The exit code, when the process exited"),
        startedAt: z.string().describe("The start time (ISO 8601)"),
        exitedAt: z.string().optional().describe("The end time (ISO 8601), when the process ended"),
        output: z.string().optional().describe("With output: true, the end of the output"),
      })
    )
    .describe("The processes of this host"),
});
