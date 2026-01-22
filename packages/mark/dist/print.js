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
 * Print utilities
 */
export const print = {
    // Basic output
    info: (msg) => {
        console.log(chalk.cyan(msg));
    },
    success: (msg) => {
        console.log(chalk.green("✓ " + msg));
    },
    error: (msg) => {
        console.error(chalk.red("✗ " + msg));
    },
    warning: (msg) => {
        console.log(chalk.yellow("⚠ " + msg));
    },
    muted: (msg) => {
        console.log(chalk.gray(msg));
    },
    highlight: (msg) => {
        console.log(chalk.bold.white(msg));
    },
    // Spinner - returns Ora instance wrapped to match our Spinner interface
    spin: (msg) => {
        const spinner = ora(msg).start();
        return {
            stop: () => spinner.stop(),
            succeed: (message) => spinner.succeed(message),
            fail: (message) => spinner.fail(message),
            get text() {
                return spinner.text;
            },
            set text(value) {
                spinner.text = value;
            },
        };
    },
    // Table - accepts array of arrays (first row is headers)
    table: (data, _options) => {
        if (data.length === 0)
            return;
        const [headers, ...rows] = data;
        if (!headers)
            return;
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
    divider: () => {
        console.log(chalk.gray("─".repeat(50)));
    },
    // Newline
    newline: () => {
        console.log();
    },
};
/**
 * Re-export chalk for direct color access
 */
export { chalk };
//# sourceMappingURL=print.js.map