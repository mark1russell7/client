/**
 * Type definitions for client-procedure
 */
import { z } from "zod";
// =============================================================================
// procedure.new Types
// =============================================================================
export const ProcedureNewInputSchema = z.object({
    /** Procedure name (e.g., "greet" or "user.create") */
    name: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, "Name must be lowercase dot-separated segments"),
    /** Namespace override (defaults to first segment of name) */
    namespace: z.string().optional(),
    /** Procedure description for CLI help */
    description: z.string().optional(),
    /** Project path (defaults to cwd) */
    path: z.string().optional(),
    /** Preview changes without creating */
    dryRun: z.boolean().default(false),
});
//# sourceMappingURL=types.js.map