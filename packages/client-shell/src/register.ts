/**
 * Procedure Registration for shell operations
 */

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
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
