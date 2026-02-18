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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "mark> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (input === "") {
      rl.prompt();
      return;
    }

    // Tokenize the same way the shell would
    const argv = tokenize(input);

    // Execute through the exact same code path as `mark <command>`
    await executeArgs(argv, ctx);

    rl.prompt();
  });

  rl.on("close", () => {
    print.info("\nGoodbye!");
    process.exit(0);
  });
}

/**
 * Simple tokenizer that handles quoted strings
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
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
    } else if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}
