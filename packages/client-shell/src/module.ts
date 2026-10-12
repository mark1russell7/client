/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for shell operations
 */

import { createProcedure, zodAdapter, defineModule, type ProcedureModule } from "@procedures/client";
import { shellRun } from "./procedures/shell/run.js";
import { shellExec } from "./procedures/shell/exec.js";
import { shellWhich } from "./procedures/shell/which.js";
import { shellStream } from "./procedures/shell/stream.js";
import {
  ShellRunInputSchema,
  ShellExecInputSchema,
  ShellWhichInputSchema,
  ShellStreamInputSchema,
  type ShellRunInput,
  type ShellRunOutput,
  type ShellExecInput,
  type ShellExecOutput,
  type ShellWhichInput,
  type ShellWhichOutput,
  type ShellStreamInput,
  type ShellStreamItem,
  ShellRunOutputSchema,
  ShellExecOutputSchema,
  ShellWhichOutputSchema,
  ShellStreamItemSchema,
} from "./types.js";

// Procedure definitions
const shellRunProcedure = createProcedure()
  .path(["shell", "run"])
  .input(zodAdapter<ShellRunInput>(ShellRunInputSchema))
  .output(zodAdapter<ShellRunOutput>(ShellRunOutputSchema))
  .meta({
    description: "Run a command with arguments",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: ShellRunInput, ctx): Promise<ShellRunOutput> => {
    return shellRun(input, ctx);
  })
  .build();

const shellExecProcedure = createProcedure()
  .path(["shell", "exec"])
  .input(zodAdapter<ShellExecInput>(ShellExecInputSchema))
  .output(zodAdapter<ShellExecOutput>(ShellExecOutputSchema))
  .meta({
    description: "Execute command string via shell",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
  })
  .handler(async (input: ShellExecInput, ctx): Promise<ShellExecOutput> => {
    return shellExec(input, ctx);
  })
  .build();

const shellWhichProcedure = createProcedure()
  .path(["shell", "which"])
  .input(zodAdapter<ShellWhichInput>(ShellWhichInputSchema))
  .output(zodAdapter<ShellWhichOutput>(ShellWhichOutputSchema))
  .meta({
    description: "Find the path to a command",
    args: ["command"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ShellWhichInput, ctx): Promise<ShellWhichOutput> => {
    return shellWhich(input, ctx);
  })
  .build();

const shellStreamProcedure = createProcedure()
  .path(["shell", "stream"])
  .input(zodAdapter<ShellStreamInput>(ShellStreamInputSchema))
  .output(zodAdapter<ShellStreamItem>(ShellStreamItemSchema))
  .meta({
    description: "Run a command and stream each output line as it arrives",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
    streaming: true,
  })
  .handler(shellStream)
  .build();

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const shellModule: ProcedureModule = defineModule("@procedures/shell", [
    shellRunProcedure,
    shellExecProcedure,
    shellWhichProcedure,
    shellStreamProcedure,
  ]);

export default shellModule;
