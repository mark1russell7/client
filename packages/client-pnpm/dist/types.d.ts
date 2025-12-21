/**
 * Type definitions for client-pnpm procedures
 *
 * client-pnpm wraps pnpm commands as procedures using client-shell.
 */
import { z } from "zod";
export interface PnpmCommandOutput {
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
export declare const PnpmInstallInputSchema: z.ZodObject<{
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    dev: z.ZodOptional<z.ZodBoolean>;
    frozen: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type PnpmInstallInput = z.infer<typeof PnpmInstallInputSchema>;
export declare const PnpmAddInputSchema: z.ZodObject<{
    packages: z.ZodArray<z.ZodString>;
    dev: z.ZodOptional<z.ZodBoolean>;
    global: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type PnpmAddInput = z.infer<typeof PnpmAddInputSchema>;
export declare const PnpmRemoveInputSchema: z.ZodObject<{
    packages: z.ZodArray<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type PnpmRemoveInput = z.infer<typeof PnpmRemoveInputSchema>;
export declare const PnpmLinkInputSchema: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type PnpmLinkInput = z.infer<typeof PnpmLinkInputSchema>;
export declare const PnpmRunInputSchema: z.ZodObject<{
    script: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type PnpmRunInput = z.infer<typeof PnpmRunInputSchema>;
export declare const PnpmStorePathInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
}>;
export type PnpmStorePathInput = z.infer<typeof PnpmStorePathInputSchema>;
export interface PnpmStorePathOutput {
    /** Absolute path to the pnpm store */
    path: string;
    /** Whether store exists */
    exists: boolean;
    /** Platform (win32, darwin, linux) */
    platform: string;
}
//# sourceMappingURL=types.d.ts.map