import { z } from "zod";
export declare const VitestRunInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    include: z.ZodOptional<z.ZodArray<z.ZodString>>;
    exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
    watch: z.ZodOptional<z.ZodBoolean>;
    coverage: z.ZodOptional<z.ZodBoolean>;
    reporter: z.ZodOptional<z.ZodEnum<["default", "verbose", "json", "junit"]>>;
    passWithNoTests: z.ZodOptional<z.ZodBoolean>;
}>;
export type VitestRunInput = z.infer<typeof VitestRunInputSchema>;
export declare const VitestRunOutputSchema: z.ZodObject<{
    success: z.ZodBoolean;
    passed: z.ZodNumber;
    failed: z.ZodNumber;
    skipped: z.ZodNumber;
    duration: z.ZodNumber;
    coverage: z.ZodOptional<z.ZodObject<{
        lines: z.ZodNumber;
        branches: z.ZodNumber;
        functions: z.ZodNumber;
        statements: z.ZodNumber;
    }>>;
}>;
export type VitestRunOutput = z.infer<typeof VitestRunOutputSchema>;
export declare const VitestWatchInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    include: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;
export type VitestWatchInput = z.infer<typeof VitestWatchInputSchema>;
export declare const VitestWatchOutputSchema: z.ZodObject<{
    pid: z.ZodNumber;
    status: z.ZodEnum<["started", "stopped"]>;
}>;
export type VitestWatchOutput = z.infer<typeof VitestWatchOutputSchema>;
//# sourceMappingURL=types.d.ts.map