const fs = require('fs');
const path = require('path');

// Types
const typesContent = `import { z } from "zod";

export const VitestRunInputSchema = z.object({
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  watch: z.boolean().optional(),
  coverage: z.boolean().optional(),
  reporter: z.enum(["default", "verbose", "json", "junit"]).optional(),
  passWithNoTests: z.boolean().optional(),
});
export type VitestRunInput = z.infer<typeof VitestRunInputSchema>;

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
export type VitestRunOutput = z.infer<typeof VitestRunOutputSchema>;

export const VitestWatchInputSchema = z.object({
  cwd: z.string().optional(),
  include: z.array(z.string()).optional(),
});
export type VitestWatchInput = z.infer<typeof VitestWatchInputSchema>;

export const VitestWatchOutputSchema = z.object({
  pid: z.number(),
  status: z.enum(["started", "stopped"]),
});
export type VitestWatchOutput = z.infer<typeof VitestWatchOutputSchema>;
`;
fs.writeFileSync(path.join(__dirname, 'src/types.ts'), typesContent);

// Run procedure
const runContent = `import { spawn } from "node:child_process";
import type { VitestRunInput, VitestRunOutput } from "../types.js";

export async function vitestRun(
  input: VitestRunInput,
  ctx: { metadata: Record<string, unknown> }
): Promise<VitestRunOutput> {
  const cwd = input.cwd ?? process.cwd();
  
  const args = ["vitest", "run"];
  
  if (input.include?.length) {
    args.push(...input.include);
  }
  if (input.exclude?.length) {
    for (const pattern of input.exclude) {
      args.push("--exclude", pattern);
    }
  }
  if (input.coverage) {
    args.push("--coverage");
  }
  if (input.reporter) {
    args.push("--reporter", input.reporter);
  }
  if (input.passWithNoTests) {
    args.push("--passWithNoTests");
  }
  args.push("--reporter", "json");
  
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    
    const proc = spawn("npx", args, {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    
    proc.on("close", (code) => {
      try {
        // Parse vitest JSON output
        const jsonMatch = stdout.match(/\{[\s\S]*"success"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          resolve({
            success: result.success ?? code === 0,
            passed: result.numPassedTests ?? 0,
            failed: result.numFailedTests ?? 0,
            skipped: result.numPendingTests ?? 0,
            duration: result.startTime ? Date.now() - result.startTime : 0,
          });
        } else {
          resolve({
            success: code === 0,
            passed: 0,
            failed: code === 0 ? 0 : 1,
            skipped: 0,
            duration: 0,
          });
        }
      } catch (e) {
        resolve({
          success: code === 0,
          passed: 0,
          failed: code === 0 ? 0 : 1,
          skipped: 0,
          duration: 0,
        });
      }
    });
    
    proc.on("error", reject);
  });
}
`;
fs.writeFileSync(path.join(__dirname, 'src/procedures/vitest/run.ts'), runContent);

// Watch procedure
const watchContent = `import { spawn } from "node:child_process";
import type { VitestWatchInput, VitestWatchOutput } from "../types.js";

export async function vitestWatch(
  input: VitestWatchInput,
  ctx: { metadata: Record<string, unknown> }
): Promise<VitestWatchOutput> {
  const cwd = input.cwd ?? process.cwd();
  
  const args = ["vitest", "watch"];
  
  if (input.include?.length) {
    args.push(...input.include);
  }
  
  const proc = spawn("npx", args, {
    cwd,
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  
  proc.unref();
  
  return {
    pid: proc.pid ?? 0,
    status: "started",
  };
}
`;
fs.writeFileSync(path.join(__dirname, 'src/procedures/vitest/watch.ts'), watchContent);

// Vitest index
const vitestIndexContent = `export { vitestRun } from "./run.js";
export { vitestWatch } from "./watch.js";
`;
fs.writeFileSync(path.join(__dirname, 'src/procedures/vitest/index.ts'), vitestIndexContent);

// Register
const registerContent = `import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { z } from "zod";
import {
  VitestRunInputSchema,
  VitestRunOutputSchema,
  VitestWatchInputSchema,
  VitestWatchOutputSchema,
} from "./types.js";
import { vitestRun } from "./procedures/vitest/run.js";
import { vitestWatch } from "./procedures/vitest/watch.js";

function zodAdapter<T>(schema: z.ZodType<T>) {
  return {
    parse: (input: unknown): T => schema.parse(input),
    safeParse: (input: unknown) => schema.safeParse(input),
  };
}

function outputSchema<T>() {
  return {
    parse: (output: unknown): T => output as T,
    safeParse: (output: unknown) => ({ success: true as const, data: output as T }),
  };
}

const vitestRunProcedure = createProcedure()
  .path(["vitest", "run"])
  .input(zodAdapter(VitestRunInputSchema))
  .output(outputSchema<z.infer<typeof VitestRunOutputSchema>>())
  .meta({
    description: "Run vitest tests",
    args: [
      { name: "cwd", type: "string", description: "Working directory" },
      { name: "coverage", type: "boolean", description: "Enable coverage" },
    ],
    shorts: { c: "coverage" },
    output: "json",
  })
  .handler(vitestRun)
  .build();

const vitestWatchProcedure = createProcedure()
  .path(["vitest", "watch"])
  .input(zodAdapter(VitestWatchInputSchema))
  .output(outputSchema<z.infer<typeof VitestWatchOutputSchema>>())
  .meta({
    description: "Start vitest in watch mode",
    args: [{ name: "cwd", type: "string", description: "Working directory" }],
    shorts: {},
    output: "json",
  })
  .handler(vitestWatch)
  .build();

registerProcedures([vitestRunProcedure, vitestWatchProcedure]);

export { vitestRunProcedure, vitestWatchProcedure };
`;
fs.writeFileSync(path.join(__dirname, 'src/register.ts'), registerContent);

// Main index
const indexContent = `export * from "./types.js";
export * from "./procedures/vitest/index.js";
export * from "./register.js";
`;
fs.writeFileSync(path.join(__dirname, 'src/index.ts'), indexContent);

console.log('Written client-vitest files');
