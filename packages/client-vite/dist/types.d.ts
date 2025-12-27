/**
 * Type definitions for client-vite procedures
 */
import { z } from "zod";
export declare const ViteDevInputSchema: z.ZodObject<{
    cwd: z.ZodString;
    port: z.ZodOptional<z.ZodNumber>;
    host: z.ZodOptional<z.ZodString>;
    open: z.ZodOptional<z.ZodBoolean>;
}>;
export type ViteDevInput = z.infer<typeof ViteDevInputSchema>;
export interface ViteDevOutput {
    /** Server identifier for management */
    serverId: string;
    /** Server URL */
    url: string;
    /** Process ID */
    pid: number;
}
export declare const ViteBuildInputSchema: z.ZodObject<{
    cwd: z.ZodString;
    outDir: z.ZodOptional<z.ZodString>;
    mode: z.ZodOptional<z.ZodString>;
}>;
export type ViteBuildInput = z.infer<typeof ViteBuildInputSchema>;
export interface ViteBuildOutput {
    /** Whether build succeeded */
    success: boolean;
    /** Output directory path */
    outDir: string;
}
export declare const VitePreviewInputSchema: z.ZodObject<{
    cwd: z.ZodString;
    port: z.ZodOptional<z.ZodNumber>;
}>;
export type VitePreviewInput = z.infer<typeof VitePreviewInputSchema>;
export interface VitePreviewOutput {
    /** Server identifier */
    serverId: string;
    /** Server URL */
    url: string;
    /** Process ID */
    pid: number;
}
export declare const ViteStopInputSchema: z.ZodObject<{
    serverId: z.ZodString;
}>;
export type ViteStopInput = z.infer<typeof ViteStopInputSchema>;
export interface ViteStopOutput {
    /** Whether stop succeeded */
    success: boolean;
}
//# sourceMappingURL=types.d.ts.map