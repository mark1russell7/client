/**
 * Procedure Registration for shell operations
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { shellRun } from "./procedures/shell/run.js";
import { shellExec } from "./procedures/shell/exec.js";
import { shellWhich } from "./procedures/shell/which.js";
import {
  ShellRunInputSchema,
  ShellExecInputSchema,
  ShellWhichInputSchema,
  type ShellRunInput,
  type ShellRunOutput,
  type ShellExecInput,
  type ShellExecOutput,
  type ShellWhichInput,
  type ShellWhichOutput,
} from "./types.js";

// Minimal schema adapter
interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

// Procedure definitions
const shellRunProcedure = createProcedure()
  .path(["shell", "run"])
  .input(zodAdapter<ShellRunInput>(ShellRunInputSchema))
  .output(outputSchema<ShellRunOutput>())
  .meta({
    description: "Run a command with arguments",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: ShellRunInput): Promise<ShellRunOutput> => {
    return shellRun(input);
  })
  .build();

const shellExecProcedure = createProcedure()
  .path(["shell", "exec"])
  .input(zodAdapter<ShellExecInput>(ShellExecInputSchema))
  .output(outputSchema<ShellExecOutput>())
  .meta({
    description: "Execute command string via shell",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: ShellExecInput): Promise<ShellExecOutput> => {
    return shellExec(input);
  })
  .build();

const shellWhichProcedure = createProcedure()
  .path(["shell", "which"])
  .input(zodAdapter<ShellWhichInput>(ShellWhichInputSchema))
  .output(outputSchema<ShellWhichOutput>())
  .meta({
    description: "Find the path to a command",
    args: ["command"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ShellWhichInput): Promise<ShellWhichOutput> => {
    return shellWhich(input);
  })
  .build();

export function registerShellProcedures(): void {
  registerProcedures([
    shellRunProcedure,
    shellExecProcedure,
    shellWhichProcedure,
  ]);
}

// Auto-register
registerShellProcedures();
