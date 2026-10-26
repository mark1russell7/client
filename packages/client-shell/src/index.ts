/**
 * @procedures/shell
 *
 * Generic shell command execution procedures.
 *
 * Provides procedures for running CLI commands:
 * - shell.run - Run command with args
 * - shell.exec - Execute command string via shell
 * - shell.which - Find command path
 * - shell.stream - Run command with args and stream each output line
 *
 * The command helpers (`runCommand`, `streamCommand`, `processes`) are also available without
 * the registration of the procedures, from `@procedures/shell/command`. The runner of the CLI
 * wrapper packages (`defineCliTool`) is in `@procedures/shell/cli`, and the fake shell of their
 * tests (`fakeShell`) is in `@procedures/shell/testing`.
 *
 * @example
 * ```typescript
 * import { Client } from "@procedures/client";
 *
 * const result = await client.call(["shell", "run"], {
 *   command: "git",
 *   args: ["status"],
 *   cwd: "/path/to/repo"
 * });
 * ```
 */

// Types
export type {
  ShellRunInput,
  ShellRunOutput,
  ShellExecInput,
  ShellExecOutput,
  ShellWhichInput,
  ShellWhichOutput,
  ShellStreamInput,
  ShellStreamItem,
} from "./types.js";

export {
  ShellRunInputSchema,
  ShellExecInputSchema,
  ShellWhichInputSchema,
  ShellStreamInputSchema,
} from "./types.js";

// Procedures
export { shellRun, shellExec, shellWhich, shellStream } from "./procedures/shell/index.js";

// Command helpers
export * from "./command/index.js";

// The runner of the CLI wrapper packages (also from `@procedures/shell/cli`)
export * from "./cli/index.js";

// Registration
export { registerShellProcedures } from "./module.js";
