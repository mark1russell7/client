/**
 * Type definitions for client-vite procedures
 */

import { z } from "zod";

// ============================================================================
// vite.dev - Start Vite dev server
// ============================================================================

export const ViteDevInputSchema: z.ZodObject<{
  cwd: z.ZodString;
  port: z.ZodOptional<z.ZodNumber>;
  host: z.ZodOptional<z.ZodString>;
  open: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  /** Working directory containing vite config */
  cwd: z.string(),
  /** Port to run on */
  port: z.number().optional(),
  /** Host to bind to */
  host: z.string().optional(),
  /** Open browser automatically */
  open: z.boolean().optional(),
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
  cwd: z.ZodString;
  outDir: z.ZodOptional<z.ZodString>;
  mode: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Working directory containing vite config */
  cwd: z.string(),
  /** Output directory */
  outDir: z.string().optional(),
  /** Build mode */
  mode: z.string().optional(),
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
  cwd: z.ZodString;
  port: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Working directory containing built output */
  cwd: z.string(),
  /** Port to run on */
  port: z.number().optional(),
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
  serverId: z.string(),
});

export type ViteStopInput = z.infer<typeof ViteStopInputSchema>;

export interface ViteStopOutput {
  /** Whether stop succeeded */
  success: boolean;
}
