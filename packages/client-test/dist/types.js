/**
 * Test execution types
 */
import { z } from "zod";
// =============================================================================
// test.run Types
// =============================================================================
export const TestRunInputSchema = z.object({
    /** Working directory (package path) */
    cwd: z.string().optional(),
    /** Test file pattern */
    pattern: z.string().optional(),
    /** Watch mode */
    watch: z.boolean().default(false),
    /** Enable coverage */
    coverage: z.boolean().default(false),
    /** Reporter to use */
    reporter: z.string().optional(),
    /** Test timeout in ms */
    timeout: z.number().optional(),
});
// =============================================================================
// test.coverage Types
// =============================================================================
export const TestCoverageInputSchema = z.object({
    /** Working directory (package path) */
    cwd: z.string().optional(),
    /** Test file pattern */
    pattern: z.string().optional(),
    /** Coverage threshold (0-100) */
    threshold: z.number().optional(),
});
//# sourceMappingURL=types.js.map