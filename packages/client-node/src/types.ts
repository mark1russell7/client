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

// ============================================================================
// node.logs - The output of a spawned process (roadmap R44)
// ============================================================================

export interface NodeLogsInput {
  /** Process ID returned from node.spawn */
  processId: string;
  /** Only the last lines of the output */
  lines?: number | undefined;
  /** Remove the ANSI escape codes (colors) from the output */
  stripAnsi?: boolean | undefined;
  /**
   * True: the result is a stream. It gives the kept output, then each new line, until the process
   * ends or the caller aborts. `lines` limits the kept output.
   */
  follow?: boolean | undefined;
}

export interface NodeLogsOutput {
  processId: string;
  /** The state of the process */
  status: "running" | "exited" | "error";
  /** The exit code, when the process exited */
  exitCode?: number | undefined;
  /** The end of the output (stdout and stderr together, the last 64 KiB) */
  output: string;
}

/** One item of `node.logs` with `follow`. */
export type NodeLogItem =
  /** A line of the output that the registry kept before the call: stdout and stderr together. */
  | { type: "output"; line: string }
  /** A new line of the process, without its line end. */
  | { type: "stdout" | "stderr"; line: string }
  /** The reader was slow, and the stream dropped this many bytes of output. */
  | { type: "dropped"; bytes: number }
  /** The end of the process: the last item. */
  | { type: "exit"; status: "exited" | "error"; exitCode?: number | undefined; signal?: string | undefined };

export const NodeLogsInputSchema: z.ZodType<NodeLogsInput> = z.object({
  processId: z.string().min(1).describe("Process ID returned from node.spawn"),
  lines: z.number().int().min(1).optional().describe("Only the last lines of the output"),
  stripAnsi: z.boolean().optional().describe("Remove the ANSI escape codes (colors) from the output"),
  follow: z
    .boolean()
    .optional()
    .describe("Give a stream: the kept output, then each new line, until the process ends or the caller aborts"),
});

export const NodeLogsValueSchema: z.ZodType<NodeLogsOutput> = z.looseObject({
  processId: z.string().describe("The id of the process"),
  status: z.enum(["running", "exited", "error"]).describe("The state of the process"),
  exitCode: z.number().optional().describe("The exit code, when the process exited"),
  output: z.string().describe("The end of the output: stdout and stderr together, the last 64 KiB"),
});

/** node.logs: one result, or with follow a stream of lines and one last exit item. */
export const NodeLogsOutputSchema: z.ZodType<NodeLogsOutput | NodeLogItem> = z.union([
  NodeLogsValueSchema,
  z.looseObject({
    type: z.enum(["output", "stdout", "stderr"]).describe("The stream of the line: output for a line that the registry kept"),
    line: z.string().describe("One line of the output, without its line end"),
  }),
  z.looseObject({
    type: z.literal("dropped").describe("A gap: the reader was slow"),
    bytes: z.number().describe("The number of bytes that the stream dropped"),
  }),
  z.looseObject({
    type: z.literal("exit").describe("The end of the process and of the stream"),
    status: z.enum(["exited", "error"]).describe("The state of the process at its end"),
    exitCode: z.number().optional().describe("The exit code, when the process exited"),
    signal: z.string().optional().describe("The signal that ended the process"),
  }),
]);
