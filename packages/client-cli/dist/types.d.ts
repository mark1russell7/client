/**
 * Type definitions for client-cli procedures
 *
 * client-cli wraps the mark CLI as procedures using client-shell.
 */
import { z } from "zod";
export declare const CliRunInputSchema: z.ZodObject<{
    path: z.ZodArray<z.ZodString>;
    args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    positional: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type CliRunInput = z.infer<typeof CliRunInputSchema>;
export interface CliRunOutput {
    /** Exit code of the command */
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
//# sourceMappingURL=types.d.ts.map