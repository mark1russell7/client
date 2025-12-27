/**
 * Type definitions for client-node procedures
 */
import { z } from "zod";
// ============================================================================
// node.run - Run script and wait for completion
// ============================================================================
export const NodeRunInputSchema = z.object({
    /** Script path to run */
    script: z.string(),
    /** Arguments to pass to the script */
    args: z.array(z.string()).optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Environment variables */
    env: z.record(z.string()).optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// ============================================================================
// node.spawn - Spawn long-running process
// ============================================================================
export const NodeSpawnInputSchema = z.object({
    /** Script path to run */
    script: z.string(),
    /** Arguments to pass to the script */
    args: z.array(z.string()).optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Environment variables */
    env: z.record(z.string()).optional(),
    /** Ready pattern - wait for this in stdout before returning */
    ready: z
        .object({
        pattern: z.string(),
        timeout: z.number().optional(),
    })
        .optional(),
});
// ============================================================================
// node.kill - Kill a spawned process
// ============================================================================
export const NodeKillInputSchema = z.object({
    /** Process ID returned from node.spawn */
    processId: z.string(),
    /** Signal to send (default: SIGTERM) */
    signal: z.string().optional(),
});
// ============================================================================
// node.status - Get status of running processes
// ============================================================================
export const NodeStatusInputSchema = z.object({
    /** Optional process ID to filter by */
    processId: z.string().optional(),
});
//# sourceMappingURL=types.js.map