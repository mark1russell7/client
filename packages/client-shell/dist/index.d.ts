/**
 * @mark1russell7/client-shell
 *
 * Generic shell command execution procedures.
 *
 * Provides procedures for running CLI commands:
 * - shell.run - Run command with args
 * - shell.exec - Execute command string via shell
 * - shell.which - Find command path
 *
 * @example
 * ```typescript
 * import { Client } from "@mark1russell7/client";
 *
 * const result = await client.call(["shell", "run"], {
 *   command: "git",
 *   args: ["status"],
 *   cwd: "/path/to/repo"
 * });
 * ```
 */
export type { ShellRunInput, ShellRunOutput, ShellExecInput, ShellExecOutput, ShellWhichInput, ShellWhichOutput, } from "./types.js";
export { ShellRunInputSchema, ShellExecInputSchema, ShellWhichInputSchema, } from "./types.js";
export { shellRun, shellExec, shellWhich } from "./procedures/shell/index.js";
export { registerShellProcedures } from "./register.js";
//# sourceMappingURL=index.d.ts.map