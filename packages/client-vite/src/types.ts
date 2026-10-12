/**
 * Type definitions for client-vite procedures
 */

import { z } from "zod";

// ============================================================================
// vite.dev - Start Vite dev server
// ============================================================================

export const ViteDevInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  port: z.ZodOptional<z.ZodNumber>;
  host: z.ZodOptional<z.ZodString>;
  open: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  /** Working directory containing vite config (default: the current folder) */
  cwd: z.string().optional().describe("Working directory containing vite config (default: the current folder)"),
  /** Port to run on */
  port: z.number().optional().describe("Port to run on"),
  /** Host to bind to */
  host: z.string().optional().describe("Host to bind to"),
  /** Open browser automatically */
  open: z.boolean().optional().describe("Open browser automatically"),
});

export type ViteDevInput = z.infer<typeof ViteDevInputSchema>;

export interface ViteDevOutput {
  /** Server identifier for management */
  serverId: string;
  /** Server URL */
  url: string;
  /** Process ID */
  pid: number;
}

// ============================================================================
// vite.build - Build for production
// ============================================================================

export const ViteBuildInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  outDir: z.ZodOptional<z.ZodString>;
  mode: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Working directory containing vite config (default: the current folder) */
  cwd: z.string().optional().describe("Working directory containing vite config (default: the current folder)"),
  /** Output directory */
  outDir: z.string().optional().describe("Output directory"),
  /** Build mode */
  mode: z.string().optional().describe("Build mode"),
});

export type ViteBuildInput = z.infer<typeof ViteBuildInputSchema>;

export interface ViteBuildOutput {
  /** Whether build succeeded */
  success: boolean;
  /** Output directory path */
  outDir: string;
}

// ============================================================================
// vite.preview - Preview production build
// ============================================================================

export const VitePreviewInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  port: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Working directory containing built output (default: the current folder) */
  cwd: z.string().optional().describe("Working directory containing built output (default: the current folder)"),
  /** Port to run on */
  port: z.number().optional().describe("Port to run on"),
});

export type VitePreviewInput = z.infer<typeof VitePreviewInputSchema>;

export interface VitePreviewOutput {
  /** Server identifier */
  serverId: string;
  /** Server URL */
  url: string;
  /** Process ID */
  pid: number;
}

// ============================================================================
// vite.stop - Stop a running server
// ============================================================================

export const ViteStopInputSchema: z.ZodObject<{
  serverId: z.ZodString;
}> = z.object({
  /** Server ID to stop */
  serverId: z.string().describe("Server ID to stop"),
});

export type ViteStopInput = z.infer<typeof ViteStopInputSchema>;

export interface ViteStopOutput {
  /** Whether stop succeeded */
  success: boolean;
}
