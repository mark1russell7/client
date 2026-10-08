/**
 * Shell command types
 */
import { z } from "zod";
export declare const ShellRunInputSchema: z.ZodObject<{
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    encoding: z.ZodDefault<z.ZodString>;
}>;
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
}
export declare const ShellExecInputSchema: z.ZodObject<{
    command: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    shell: z.ZodDefault<z.ZodUnion<[z.ZodBoolean, z.ZodString]>>;
    maxBuffer: z.ZodOptional<z.ZodNumber>;
    stdin: z.ZodOptional<z.ZodString>;
}>;
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
export declare const ShellWhichInputSchema: z.ZodObject<{
    command: z.ZodString;
}>;
export type ShellWhichInput = z.infer<typeof ShellWhichInputSchema>;
export interface ShellWhichOutput {
    /** Full path to command, or null if not found */
    path: string | null;
    /** Whether command was found */
    found: boolean;
}
//# sourceMappingURL=types.d.ts.map