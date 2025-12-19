/**
 * Type definitions for client-procedure
 */
import { z } from "zod";
export declare const ProcedureNewInputSchema: z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}>;
export type ProcedureNewInput = z.infer<typeof ProcedureNewInputSchema>;
export interface ProcedureNewOutput {
    /** Whether creation succeeded */
    success: boolean;
    /** Full procedure path (e.g., ["user", "create"]) */
    procedurePath: string[];
    /** Files created */
    created: string[];
    /** Files modified */
    modified: string[];
    /** Operations performed */
    operations: string[];
    /** Any errors encountered */
    errors: string[];
}
//# sourceMappingURL=types.d.ts.map