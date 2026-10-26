/**
 * `@procedures/shell/testing`: a fake shell for the tests of the wrapper packages (dedupe review F2).
 *
 * `fakeShell(results)` gives the shell procedures with their real schemas, effects and rules of
 * the root, and handlers that record each input and answer with a scripted result. No program
 * starts. It gives the same fake in two forms:
 * - `module`: put it before the module of the wrapper in `createRegistry()`. The first module of
 *   a name counts, so the fake takes the place of the real shell.
 * - `client`: give it as `ctx.client` to a handler that a test calls directly.
 *
 * This entry point has no side effects: it registers no procedures.
 */

import { defineModule, type AnyProcedure, type ProcedureContext, type ProcedureModule } from "@procedures/client";
import { shellModule } from "./module.js";
import type { ShellRunOutput, ShellStreamItem } from "./types.js";

/** The scripted result of one call of the fake shell. Each field has a default. */
export interface FakeShellResult {
  /** The exit code (default: 0) */
  exitCode?: number | undefined;
  /** The standard output (default: empty) */
  stdout?: string | undefined;
  /** The standard error (default: empty) */
  stderr?: string | undefined;
  /** The signal that ended the program (default: none) */
  signal?: string | undefined;
}

/** The input of a call of the fake shell, as the fake got it. */
export interface FakeShellInput {
  command: string;
  args: string[];
  cwd?: string | undefined;
  timeout?: number | undefined;
  env?: Record<string, string> | undefined;
  [field: string]: unknown;
}

/**
 * The results of the fake shell:
 * - one result for each call;
 * - a list with the result of each call, in order (after the list, the `fallback` of the options);
 * - a function of the input and of the index of the call.
 */
export type FakeShellResults = FakeShellResult | readonly FakeShellResult[] | ((input: FakeShellInput, index: number) => FakeShellResult);

/** The options of `fakeShell()`. */
export interface FakeShellOptions {
  /** The result after the end of a list of results (default: exit code 0 and no output) */
  fallback?: FakeShellResult | undefined;
}

/** The fake shell that `fakeShell()` gives. */
export interface FakeShell {
  /** The input of each `shell.run` call, in order */
  readonly calls: FakeShellInput[];
  /** The input of each `shell.stream` call, in order */
  readonly streams: FakeShellInput[];
  /** The shell procedures with the fake handlers. `shell.which` is the real one. */
  readonly procedures: AnyProcedure[];
  /** The module `@procedures/shell` with the fake procedures */
  readonly module: ProcedureModule;
  /** A client for `ctx.client`: it answers `shell.run` and `shell.stream`, and it refuses other paths. */
  readonly client: ProcedureContext["client"];
  /** This function gives the argument list of a `shell.run` call (default: the first). It throws when the call is missing. */
  args(index?: number): string[];
}

/** The full output of a scripted result. */
function outputOf(result: FakeShellResult): ShellRunOutput {
  const exitCode = result.exitCode ?? 0;
  const output: ShellRunOutput = { exitCode, stdout: result.stdout ?? "", stderr: result.stderr ?? "", success: exitCode === 0, duration: 1 };
  if (result.signal !== undefined) output.signal = result.signal;
  return output;
}

/** The lines of a text, without the line ends and without a last empty line. */
function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * This function gives a fake shell. Each `shell.run` call records its input in `calls` and gives
 * the next scripted result. Each `shell.stream` call records its input in `streams` and gives the
 * lines of the result, then the exit item. `shell.exec` throws: a wrapper never runs a shell string.
 */
export function fakeShell(results: FakeShellResults = {}, options: FakeShellOptions = {}): FakeShell {
  const calls: FakeShellInput[] = [];
  const streams: FakeShellInput[] = [];
  let index = 0;
  const next = (input: FakeShellInput): FakeShellResult => {
    const at = index++;
    if (typeof results === "function") return results(input, at);
    if (Array.isArray(results)) return (results as readonly FakeShellResult[])[at] ?? options.fallback ?? {};
    return results as FakeShellResult;
  };

  const run = (input: FakeShellInput): ShellRunOutput => {
    calls.push(input);
    return outputOf(next(input));
  };
  async function* stream(input: FakeShellInput): AsyncGenerator<ShellStreamItem> {
    streams.push(input);
    const output = outputOf(next(input));
    for (const line of linesOf(output.stdout)) yield { type: "stdout", line };
    for (const line of linesOf(output.stderr)) yield { type: "stderr", line };
    const exit: Extract<ShellStreamItem, { type: "exit" }> = { type: "exit", exitCode: output.exitCode, duration: output.duration };
    if (output.signal !== undefined) exit.signal = output.signal;
    yield exit;
  }

  const procedures = shellModule.procedures.map((procedure): AnyProcedure => {
    switch (procedure.path.join(".")) {
      case "shell.run":
        return { ...procedure, handler: async (input: FakeShellInput) => run(input) } as AnyProcedure;
      case "shell.stream":
        return { ...procedure, handler: stream } as AnyProcedure;
      case "shell.exec":
        return {
          ...procedure,
          handler: async () => {
            throw new Error("fakeShell: shell.exec runs a shell string, and a wrapper must call shell.run with argv");
          },
        } as AnyProcedure;
      default:
        return procedure;
    }
  });

  const refuse = (path: readonly string[]): Error => new Error(`fakeShell: the fake client answers only shell.run and shell.stream, not ${path.join(".")}`);
  const client = {
    async call(path: readonly string[], input: unknown): Promise<unknown> {
      const key = path.join(".");
      if (key === "shell.run") return run(input as FakeShellInput);
      if (key === "shell.stream") {
        let last: ShellStreamItem | undefined;
        for await (const item of stream(input as FakeShellInput)) last = item;
        return last;
      }
      throw refuse(path);
    },
    stream(path: readonly string[], input: unknown): AsyncIterable<unknown> {
      if (path.join(".") === "shell.stream") return stream(input as FakeShellInput);
      throw refuse(path);
    },
  } as unknown as ProcedureContext["client"];

  return {
    calls,
    streams,
    procedures,
    module: defineModule("@procedures/shell", procedures),
    client,
    args(at = 0): string[] {
      const call = calls[at];
      if (call === undefined) throw new Error(`fakeShell: there is no shell.run call ${at} (${calls.length} calls)`);
      return call.args;
    },
  };
}
