/**
 * Test execution types
 */
import { z } from "zod";
export declare const TestRunInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    pattern: z.ZodOptional<z.ZodString>;
    watch: z.ZodDefault<z.ZodBoolean>;
    coverage: z.ZodDefault<z.ZodBoolean>;
    reporter: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type TestRunInput = z.infer<typeof TestRunInputSchema>;
export interface TestRunOutput {
    /** Whether tests passed */
    success: boolean;
    /** Exit code from test runner */
    exitCode: number;
    /** Test output */
    stdout: string;
    /** Error output */
    stderr: string;
    /** Duration in ms */
    duration: number;
}
export declare const TestCoverageInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    pattern: z.ZodOptional<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
}>;
export type TestCoverageInput = z.infer<typeof TestCoverageInputSchema>;
export interface TestCoverageOutput {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    /** Coverage percentage if parseable */
    coverage?: number | undefined;
}
//# sourceMappingURL=types.d.ts.map