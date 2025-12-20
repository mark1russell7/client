const fs = require('fs');
const path = require('path');

const code = `import { z } from "zod";

export const VitestRunInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
  exclude: z.ZodOptional<z.ZodArray<z.ZodString>>;
  watch: z.ZodOptional<z.ZodBoolean>;
  coverage: z.ZodOptional<z.ZodBoolean>;
  reporter: z.ZodOptional<z.ZodEnum<["default", "verbose", "json", "junit"]>>;
  passWithNoTests: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  watch: z.boolean().optional(),
  coverage: z.boolean().optional(),
  reporter: z.enum(["default", "verbose", "json", "junit"]).optional(),
  passWithNoTests: z.boolean().optional(),
});
export type VitestRunInput = z.infer<typeof VitestRunInputSchema>;

export const VitestRunOutputSchema: z.ZodObject<{
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
}> = z.object({
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
export type VitestRunOutput = z.infer<typeof VitestRunOutputSchema>;

export const VitestWatchInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  include: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
});
export type VitestWatchInput = z.infer<typeof VitestWatchInputSchema>;

export const VitestWatchOutputSchema: z.ZodObject<{
  pid: z.ZodNumber;
  status: z.ZodEnum<["started", "stopped"]>;
}> = z.object({
  pid: z.number(),
  status: z.enum(["started", "stopped"]),
});
export type VitestWatchOutput = z.infer<typeof VitestWatchOutputSchema>;
`;

fs.writeFileSync(path.join(__dirname, 'src/types.ts'), code);
console.log('Written types.ts');
