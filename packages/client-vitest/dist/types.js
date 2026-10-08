import { z } from "zod";
export const VitestRunInputSchema = z.object({
    cwd: z.string().optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    watch: z.boolean().optional(),
    coverage: z.boolean().optional(),
    reporter: z.enum(["default", "verbose", "json", "junit"]).optional(),
    passWithNoTests: z.boolean().optional(),
});
export const VitestRunOutputSchema = z.object({
    success: z.boolean(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
    duration: z.number(),
    coverage: z.object({
        lines: z.number(),
        branches: z.number(),
        functions: z.number(),
        statements: z.number(),
    }).optional(),
});
export const VitestWatchInputSchema = z.object({
    cwd: z.string().optional(),
    include: z.array(z.string()).optional(),
});
export const VitestWatchOutputSchema = z.object({
    pid: z.number(),
    status: z.enum(["started", "stopped"]),
});
//# sourceMappingURL=types.js.map