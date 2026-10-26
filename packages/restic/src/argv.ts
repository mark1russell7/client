/**
 * The argv of a CLI command from a command path, named arguments and positional arguments. The
 * procedures start the program with argv, never through a shell. The helpers are the shared ones
 * of `@procedures/shell/cli` (dedupe review F2): this file keeps the exports of this package.
 */

export { buildArgv, parseJsonOutput, FLAG_NAME, type ArgValue } from "@procedures/shell/cli";
