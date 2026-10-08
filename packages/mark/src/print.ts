/**
 * Terminal Output Utilities
 *
 * Replaces Gluegun's print with Chalk + Ora + cli-table3
 * Provides a consistent interface for CLI output.
 */

import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";

/**
 * Spinner interface (compatible with existing code)
 */
export interface Spinner {
  stop: () => void;
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
  text: string;
}

/**
 * Print utilities
 */
export const print = {
  // Basic output
  info: (msg: string): void => {
    console.log(chalk.cyan(msg));
  },

  success: (msg: string): void => {
    console.log(chalk.green("✓ " + msg));
  },

  error: (msg: string): void => {
    console.error(chalk.red("✗ " + msg));
  },

  warning: (msg: string): void => {
    console.log(chalk.yellow("⚠ " + msg));
  },

  muted: (msg: string): void => {
    console.log(chalk.gray(msg));
  },

  highlight: (msg: string): void => {
    console.log(chalk.bold.white(msg));
  },

  // Spinner - returns Ora instance wrapped to match our Spinner interface
  spin: (msg: string): Spinner => {
    const spinner = ora(msg).start();
    return {
      stop: () => spinner.stop(),
      succeed: (message?: string) => spinner.succeed(message),
      fail: (message?: string) => spinner.fail(message),
      get text() {
        return spinner.text;
      },
      set text(value: string) {
        spinner.text = value;
      },
    };
  },

  // Table - accepts array of arrays (first row is headers)
  table: (data: string[][], _options?: { format?: string }): void => {
    if (data.length === 0) return;

    const [headers, ...rows] = data;
    if (!headers) return;

    const table = new Table({
      head: headers.map((h) => chalk.bold(h)),
      style: {
        head: [],
        border: [],
      },
    });

    for (const row of rows) {
      table.push(row);
    }

    console.log(table.toString());
  },

  // Divider line
  divider: (): void => {
    console.log(chalk.gray("─".repeat(50)));
  },

  // Newline
  newline: (): void => {
    console.log();
  },
};

/**
 * Print interface type for external use
 */
export type Print = typeof print;

/**
 * Re-export chalk for direct color access
 */
export { chalk };
