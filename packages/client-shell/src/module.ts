/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for shell operations
 */

import { createProcedure, defineModule, type Effects, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
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
  ShellRunOutputSchema,
  ShellExecOutputSchema,
  ShellWhichOutputSchema,
  ShellStreamItemSchema,
} from "./types.js";

/**
 * The effects of a procedure that runs a program that its caller chooses. The program can read
 * and change anything, so "process" names both. A caller of these procedures declares what its
 * program does.
 */
const RUNS_PROGRAM: Effects = { reads: ["process"], writes: ["process"] };

// Procedure definitions
const shellRunProcedure = createProcedure()
  .path(["shell", "run"])
  .input(ShellRunInputSchema)
  .output(ShellRunOutputSchema)
  .meta({
    description: "Run a command with arguments",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
    effects: RUNS_PROGRAM,
    // Under a root of the host: only the nested call of a confined procedure that names shell.run
    fsRoot: { cwd: "cwd", program: true },
  })
  .handler(async (input: ShellRunInput, ctx): Promise<ShellRunOutput> => {
    return shellRun(input, ctx);
  })
  .build();

const shellExecProcedure = createProcedure()
  .path(["shell", "exec"])
  .input(ShellExecInputSchema)
  .output(ShellExecOutputSchema)
  .meta({
    description: "Execute command string via shell",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
    effects: RUNS_PROGRAM,
    fsRoot: { refuse: "it runs a command line in a shell, and the command can reach each folder of the host" },
  })
  .handler(async (input: ShellExecInput, ctx): Promise<ShellExecOutput> => {
    return shellExec(input, ctx);
  })
  .build();

const shellWhichProcedure = createProcedure()
  .path(["shell", "which"])
  .input(ShellWhichInputSchema)
  .output(ShellWhichOutputSchema)
  .meta({
    description: "Find the path to a command",
    args: ["command"],
    shorts: {},
    output: "json",
    // A fixed program (`where` or `which`) reads the folders of PATH and changes nothing
    effects: { reads: ["fs"], writes: [] },
    fsRoot: { refuse: "it reads the folders of PATH, and they are outside the root" },
  })
  .handler(async (input: ShellWhichInput, ctx): Promise<ShellWhichOutput> => {
    return shellWhich(input, ctx);
  })
  .build();

const shellStreamProcedure = createProcedure()
  .path(["shell", "stream"])
  .input(ShellStreamInputSchema)
  .output(ShellStreamItemSchema)
  .meta({
    description: "Run a command and stream each output line as it arrives",
    args: ["command"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
    streaming: true,
    // A program can print without an end (tail -f, a server): roadmap R15
    stream: { unbounded: true },
    effects: RUNS_PROGRAM,
    fsRoot: { cwd: "cwd", program: true },
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

/**
 * This function registers the procedures of @procedures/shell, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerShellProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [shellModule]);
}
