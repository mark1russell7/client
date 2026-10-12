/**
 * Shell command types
 */

import { z } from "zod";

// =============================================================================
// shell.run Types
// =============================================================================

export const ShellRunInputSchema: z.ZodObject<{
  command: z.ZodString;
  args: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  timeout: z.ZodOptional<z.ZodNumber>;
  encoding: z.ZodDefault<z.ZodString>;
}> = z.object({
  /** Command to run */
  command: z.string().describe("Command to run"),
  /** Arguments to pass */
  args: z.array(z.string()).default([]).describe("Arguments to pass"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Environment variables to set */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables to set"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
  /** Encoding for output (default: utf8) */
  encoding: z.string().default("utf8").describe("Encoding for output (default: utf8)"),
});

export type ShellRunInput = z.infer<typeof ShellRunInputSchema>;

export interface ShellRunOutput {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** The signal that ended the process, if it was killed (for example by the timeout) */
  signal?: string | undefined;
}

// =============================================================================
// shell.exec Types (more options)
// =============================================================================

export const ShellExecInputSchema: z.ZodObject<{
  command: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  timeout: z.ZodOptional<z.ZodNumber>;
  shell: z.ZodDefault<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>;
  maxBuffer: z.ZodOptional<z.ZodNumber>;
  stdin: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Full command string to execute via shell */
  command: z.string().describe("Full command string to execute via shell"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
  /** Timeout in milliseconds. At the timeout, the shell and the programs that it started are killed. */
  timeout: z.number().optional().describe("Timeout in milliseconds. At the timeout, the shell and the programs that it started are killed."),
  /** Shell to use: a path, or `true` for the system shell (`cmd.exe` or `/bin/sh`). `false` is the same as `true`. */
  shell: z.union([z.boolean(), z.string()]).default(true).describe("Shell to use: a path, or `true` for the system shell (`cmd.exe` or `/bin/sh`). `false` is the same as `true`."),
  /** The most bytes kept of each output stream (default: 64 MiB). The procedure drops the rest. */
  maxBuffer: z.number().optional().describe("The most bytes kept of each output stream (default: 64 MiB). The procedure drops the rest."),
  /** Text to write to stdin. Without it, stdin is empty. */
  stdin: z.string().optional().describe("Text to write to stdin. Without it, stdin is empty."),
});

export type ShellExecInput = z.infer<typeof ShellExecInputSchema>;

export interface ShellExecOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  duration: number;
  /** Signal that terminated the process (if any) */
  signal?: string | undefined;
}

// =============================================================================
// shell.which Types
// =============================================================================

export const ShellWhichInputSchema: z.ZodObject<{
  command: z.ZodString;
}> = z.object({
  /** Command to find */
  command: z.string().describe("Command to find"),
});

export type ShellWhichInput = z.infer<typeof ShellWhichInputSchema>;

export interface ShellWhichOutput {
  /** Full path to command, or null if not found */
  path: string | null;
  /** Whether command was found */
  found: boolean;
}

// =============================================================================
// shell.stream Types - Run a command and stream each output line as it arrives
// =============================================================================

export const ShellStreamInputSchema: z.ZodObject<{
  command: z.ZodString;
  args: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  command: z.string().describe("The program to start (no shell: arguments go in args)"),
  args: z.array(z.string()).default([]).describe("The arguments of the program"),
  cwd: z.string().optional().describe("Working directory"),
  env: z.record(z.string(), z.string()).optional().describe("Environment variables (added to the environment of the host)"),
  timeout: z.number().optional().describe("Timeout in milliseconds. At the timeout, the program and its children are killed."),
});

export type ShellStreamInput = z.infer<typeof ShellStreamInputSchema>;

/** One item of shell.stream: an output line, or the exit of the command (the last item). */
export type ShellStreamItem =
  | { type: "stdout" | "stderr"; line: string }
  | { type: "exit"; exitCode: number; duration: number; signal?: string | undefined };

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema would
// remove it when the output is validated).

const commandResult = {
  exitCode: z.number().describe("The exit code (0 is success, -1 when a signal ended the program)"),
  stdout: z.string().describe("The standard output"),
  stderr: z.string().describe("The standard error"),
  success: z.boolean().describe("True when the exit code is 0"),
  duration: z.number().describe("The time of the command, in milliseconds"),
  signal: z.string().optional().describe("The signal that ended the program (for example at the timeout)"),
};

export const ShellRunOutputSchema: z.ZodType<ShellRunOutput> = z.looseObject(commandResult);

export const ShellExecOutputSchema: z.ZodType<ShellExecOutput> = z.looseObject(commandResult);

export const ShellWhichOutputSchema: z.ZodType<ShellWhichOutput> = z.looseObject({
  path: z.string().nullable().describe("The full path of the program, or null when it is not found"),
  found: z.boolean().describe("True when the program is found"),
});

export const ShellStreamItemSchema: z.ZodType<ShellStreamItem> = z.union([
  z.looseObject({
    type: z.enum(["stdout", "stderr"]).describe("The stream of the line"),
    line: z.string().describe("One line of output, without its line end"),
  }),
  z.looseObject({
    type: z.literal("exit").describe("The end of the stream (the last item)"),
    exitCode: z.number().describe("The exit code (-1 when a signal ended the program)"),
    duration: z.number().describe("The time of the command, in milliseconds"),
    signal: z.string().optional().describe("The signal that ended the program"),
  }),
]);
