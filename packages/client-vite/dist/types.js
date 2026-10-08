/**
 * Type definitions for client-vite procedures
 */
import { z } from "zod";
// ============================================================================
// vite.dev - Start Vite dev server
// ============================================================================
export const ViteDevInputSchema = z.object({
    /** Working directory containing vite config */
    cwd: z.string(),
    /** Port to run on */
    port: z.number().optional(),
    /** Host to bind to */
    host: z.string().optional(),
    /** Open browser automatically */
    open: z.boolean().optional(),
});
// ============================================================================
// vite.build - Build for production
// ============================================================================
export const ViteBuildInputSchema = z.object({
    /** Working directory containing vite config */
    cwd: z.string(),
    /** Output directory */
    outDir: z.string().optional(),
    /** Build mode */
    mode: z.string().optional(),
});
// ============================================================================
// vite.preview - Preview production build
// ============================================================================
export const VitePreviewInputSchema = z.object({
    /** Working directory containing built output */
    cwd: z.string(),
    /** Port to run on */
    port: z.number().optional(),
});
// ============================================================================
// vite.stop - Stop a running server
// ============================================================================
export const ViteStopInputSchema = z.object({
    /** Server ID to stop */
    serverId: z.string(),
});
//# sourceMappingURL=types.js.map