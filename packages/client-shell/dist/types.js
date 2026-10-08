/**
 * Shell command types
 */
import { z } from "zod";
// =============================================================================
// shell.run Types
// =============================================================================
export const ShellRunInputSchema = z.object({
    /** Command to run */
    command: z.string(),
    /** Arguments to pass */
    args: z.array(z.string()).default([]),
    /** Working directory */
    cwd: z.string().optional(),
    /** Environment variables to set */
    env: z.record(z.string()).optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
    /** Encoding for output (default: utf8) */
    encoding: z.string().default("utf8"),
});
// =============================================================================
// shell.exec Types (more options)
// =============================================================================
export const ShellExecInputSchema = z.object({
    /** Full command string to execute via shell */
    command: z.string(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Environment variables */
    env: z.record(z.string()).optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
    /** Shell to use (default: system shell) */
    shell: z.union([z.boolean(), z.string()]).default(true),
    /** Max buffer size for stdout/stderr */
    maxBuffer: z.number().optional(),
    /** Input to pipe to stdin */
    stdin: z.string().optional(),
});
// =============================================================================
// shell.which Types
// =============================================================================
export const ShellWhichInputSchema = z.object({
    /** Command to find */
    command: z.string(),
});
//# sourceMappingURL=types.js.map