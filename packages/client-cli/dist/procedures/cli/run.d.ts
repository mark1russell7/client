/**
 * cli.run procedure
 *
 * Wraps the mark CLI as a procedure using client-shell.
 * This allows calling any mark CLI command programmatically.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CliRunInput, CliRunOutput } from "../../types.js";
/**
 * Run a mark CLI command
 *
 * @example
 * // Equivalent to: mark lib new my-package
 * await client.call(["cli", "run"], {
 *   path: ["lib", "new"],
 *   positional: ["my-package"],
 * });
 *
 * @example
 * // Equivalent to: mark procedure new fs.read --description "Read a file"
 * await client.call(["cli", "run"], {
 *   path: ["procedure", "new"],
 *   positional: ["fs.read"],
 *   args: { description: "Read a file" },
 * });
 */
export declare function cliRun(input: CliRunInput, ctx: ProcedureContext): Promise<CliRunOutput>;
//# sourceMappingURL=run.d.ts.map