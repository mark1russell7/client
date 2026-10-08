/**
 * Type definitions for client-cli procedures
 *
 * client-cli wraps the mark CLI as procedures using client-shell.
 */
import { z } from "zod";
// =============================================================================
// cli.run Types
// =============================================================================
export const CliRunInputSchema = z.object({
    /** Procedure path to call, e.g. ["lib", "new"] for "mark lib new" */
    path: z.array(z.string()),
    /** Named arguments as key-value pairs, e.g. { name: "foo" } -> "--name foo" */
    args: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    /** Positional arguments after the path */
    positional: z.array(z.string()).optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
//# sourceMappingURL=types.js.map