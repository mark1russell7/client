/**
 * @mark1russell7/client-cli
 *
 * Wraps the mark CLI as procedures using client-shell.
 *
 * @example
 * ```typescript
 * import { Client } from "@mark1russell7/client";
 *
 * // Equivalent to: mark lib new my-package
 * const result = await client.call(["cli", "run"], {
 *   path: ["lib", "new"],
 *   positional: ["my-package"],
 * });
 *
 * if (result.success) {
 *   console.log(result.stdout);
 * }
 * ```
 */
export type { CliRunInput, CliRunOutput } from "./types.js";
export { CliRunInputSchema } from "./types.js";
export { cliRun } from "./procedures/cli/index.js";
export { registerCliProcedures } from "./register.js";
//# sourceMappingURL=index.d.ts.map