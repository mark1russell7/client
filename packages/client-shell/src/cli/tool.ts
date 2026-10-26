/**
 * `defineCliTool()`: the one runner of the CLI wrapper packages (dedupe review F2).
 *
 * Each command goes as an argument list to the `shell.run` procedure, through `ctx.client`. No
 * shell runs, so a value cannot start a second command. The nested call keeps the rules of the
 * host: the declared calls, the effects, the root of the files and the signal of the call.
 * `packages/documentation/SERVER-LAYERS.md` gives the reason for this run path.
 */

import type { ProcedureContext } from "@procedures/client";
import { cliArg, parseJsonDocument } from "./argv.js";
import type { CliToolJsonOutput, CliToolOutput } from "./output.js";
import type { CliProgram } from "./program.js";

/** The part of the procedure context that a CLI tool uses: the client of the nested call. */
export type CliToolContext = Pick<ProcedureContext, "client">;

/** The options of one command of a CLI tool. */
export interface CliRunOptions {
  /** The working folder of the program */
  cwd?: string | undefined;
  /** The time limit, in milliseconds. At the limit, `shell.run` kills the process tree. */
  timeout?: number | undefined;
  /** The environment variables that the program gets in addition to the environment of the host */
  env?: Record<string, string> | undefined;
}

/** The input of a `shell.run` call that a CLI tool makes. */
export interface CliShellInput {
  command: string;
  args: string[];
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/** A failed command of a CLI tool: its exit code and its standard error. */
export class CliToolError extends Error {
  override readonly name: string = "CliToolError";
  constructor(
    message: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(message);
  }
}

/** The definition of a CLI tool. */
export interface CliToolOptions {
  /** The name of the program in the error messages. Without `resolve`, it is also the program. */
  readonly name: string;
  /**
   * This function gives the program at each command: a command name, or a program with the first
   * arguments. A throw is the error of the command (the program was not found).
   */
  readonly resolve?: (() => CliProgram | string) | undefined;
  /** This function makes the error of a failed command for `output()` and `json()` (default: `CliToolError`). */
  readonly error?: ((message: string, exitCode: number, stderr: string) => Error) | undefined;
}

/** The runner of a CLI tool that `defineCliTool()` gives. */
export interface CliTool {
  /** The name of the program */
  readonly name: string;
  /** This function gives a value that the program reads as an argument. It throws for a value that starts with "-". */
  arg(name: string, value: string): string;
  /** This function gives the `shell.run` input of a command. It throws when the program is not found. */
  shellInput(args: readonly string[], options?: CliRunOptions): CliShellInput;
  /** This function runs a command and gives its result. It throws when the program is not found or `shell.run` fails. */
  call(args: readonly string[], options: CliRunOptions, ctx: CliToolContext): Promise<CliToolOutput>;
  /** This function runs a command and gives its result. It does not throw: an error gives exit code 1 and its message as `stderr`. */
  run(args: readonly string[], options: CliRunOptions, ctx: CliToolContext): Promise<CliToolOutput>;
  /** This function runs a command that writes JSON, and gives `data` when `parse` reads the output. It does not throw. */
  runJson(args: readonly string[], options: CliRunOptions, ctx: CliToolContext, parse?: (stdout: string) => unknown): Promise<CliToolJsonOutput>;
  /** This function runs a command and gives its standard output. It throws the tool error for an exit code other than 0. */
  output(args: readonly string[], options: CliRunOptions, ctx: CliToolContext): Promise<string>;
  /** This function runs a command that writes JSON and gives the parsed value. It throws the tool error for a failure or for output that is not JSON. */
  json<T>(args: readonly string[], options: CliRunOptions, ctx: CliToolContext): Promise<T>;
}

/** The first two words of a command, for an error message. */
function commandWords(name: string, args: readonly string[]): string {
  return `${name} ${args[0] ?? ""} ${args[1] ?? ""}`;
}

/**
 * This function defines the runner of a CLI tool. The wrapper package keeps its procedures, its
 * schemas and its own argument rules. The runner gives the run, the JSON, the argument guard
 * and the shared result.
 */
export function defineCliTool(options: CliToolOptions): CliTool {
  const { name } = options;
  const makeError = options.error ?? ((message: string, exitCode: number, stderr: string) => new CliToolError(message, exitCode, stderr));

  const shellInput = (args: readonly string[], run: CliRunOptions = {}): CliShellInput => {
    const resolved = options.resolve?.() ?? name;
    const program: CliProgram = typeof resolved === "string" ? { command: resolved, prefix: [] } : resolved;
    const input: CliShellInput = { command: program.command, args: [...program.prefix, ...args] };
    if (run.cwd !== undefined) input.cwd = run.cwd;
    if (run.timeout !== undefined) input.timeout = run.timeout;
    if (run.env !== undefined) input.env = run.env;
    return input;
  };

  const call = async (args: readonly string[], run: CliRunOptions, ctx: CliToolContext): Promise<CliToolOutput> => {
    const startTime = Date.now();
    const result = await ctx.client.call<CliShellInput, { exitCode: number; stdout: string; stderr: string }>(["shell", "run"], shellInput(args, run));
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.exitCode === 0,
      duration: Date.now() - startTime,
    };
  };

  const runCommand = async (args: readonly string[], run: CliRunOptions, ctx: CliToolContext): Promise<CliToolOutput> => {
    const startTime = Date.now();
    try {
      return await call(args, run, ctx);
    } catch (error) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        success: false,
        duration: Date.now() - startTime,
      };
    }
  };

  const output = async (args: readonly string[], run: CliRunOptions, ctx: CliToolContext): Promise<string> => {
    const result = await call(args, run, ctx);
    if (result.exitCode !== 0) {
      const text = result.stderr.trim() || result.stdout.trim();
      throw makeError(`${commandWords(name, args)} failed (exit ${result.exitCode}): ${text}`.trim(), result.exitCode, result.stderr);
    }
    return result.stdout;
  };

  return {
    name,
    arg: cliArg,
    shellInput,
    call,
    run: runCommand,
    async runJson(args, run, ctx, parse = parseJsonDocument) {
      const result: CliToolJsonOutput = await runCommand(args, run, ctx);
      const data = parse(result.stdout);
      if (data !== undefined) result.data = data;
      return result;
    },
    output,
    async json<T>(args: readonly string[], run: CliRunOptions, ctx: CliToolContext): Promise<T> {
      const stdout = await output(args, run, ctx);
      try {
        return JSON.parse(stdout) as T;
      } catch {
        throw makeError(`${commandWords(name, args)} gave no JSON: ${stdout.slice(0, 200)}`, 0, "");
      }
    },
  };
}
