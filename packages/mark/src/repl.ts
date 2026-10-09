/**
 * Interactive REPL Mode
 *
 * Thin wrapper around the CLI. Loads procedures once,
 * then executes each line through the same code path as `mark <command>`.
 */

import * as readline from "node:readline";
import { print } from "./print.js";
import { initCli, executeArgs, type CliContext } from "./cli.js";

export interface ReplOptions {
  /** Verbose output */
  verbose?: boolean | undefined;
}

/**
 * Start the interactive REPL
 */
export async function startRepl(options: ReplOptions): Promise<void> {
  const { verbose = false } = options;

  // One-time initialization (same as CLI startup)
  const spinner = print.spin("Loading procedures...");
  const ctx: CliContext = await initCli(verbose);
  spinner.succeed(`Ready (${ctx.procedures.length} procedures)`);

  print.info("Type any command (without 'mark' prefix). Ctrl+C to exit.\n");

  const reader = lineReader(process.stdin, process.stdout);
  await runLines(reader.lines, (argv) => executeArgs(argv, ctx), reader.prompt);

  print.info("\nGoodbye!");
  // A piped script keeps the exit code of its failed commands. An interactive session exits with 0.
  process.exit(process.stdin.isTTY ? 0 : (process.exitCode ?? 0));
}

/**
 * The lines of an input, and a prompt that does nothing after the input ends. (A piped script
 * ends its input while a command runs: a prompt after that threw "readline was closed".)
 */
export function lineReader(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream
): { lines: AsyncIterable<string>; prompt: () => void } {
  const rl = readline.createInterface({ input, output, prompt: "mark> " });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });
  return {
    lines: rl,
    prompt: () => {
      if (!closed) {
        rl.prompt();
      }
    },
  };
}

/**
 * Run each line as a command, one at a time and in order: a command ends before the next line
 * starts. The function returns after the last line, when the input ends. (Before, each line
 * started at once, so the commands ran together, and a piped script stopped at its end before
 * its commands were done: deep dive CLI-15.)
 */
export async function runLines(
  lines: AsyncIterable<string>,
  execute: (argv: string[]) => Promise<void>,
  prompt: () => void = () => {}
): Promise<void> {
  prompt();
  for await (const line of lines) {
    const input = line.trim();
    if (input !== "") {
      // Tokenize the same way the shell would, then run it as `mark <command>` does
      await execute(tokenize(input));
    }
    prompt();
  }
}

/**
 * Simple tokenizer that handles quoted strings. A quoted empty string ("") is a token.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let inQuote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      started = true;
    } else if (ch === " " || ch === "\t") {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += ch;
      started = true;
    }
  }

  if (started) {
    tokens.push(current);
  }

  return tokens;
}
