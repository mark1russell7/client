/**
 * `@procedures/shell/cli`: the shared parts of the CLI wrapper packages (dedupe review F2).
 *
 * - `defineCliTool()` gives the runner of a program: `run`, `runJson`, `output`, `json` and the
 *   argument guard. Each command goes as argv to the `shell.run` procedure, never as a shell string.
 * - `cliArg()`, `buildArgv()`, `parseJsonDocument()` and `parseJsonOutput()` build the argv and
 *   read the output.
 * - `CliToolOutput` and `cliToolOutputSchema()` are the shared result and its schema.
 * - `nodeScript()`, `execPathProgram()` and `findInPath()` find the program without a shell.
 *
 * This entry point has no side effects: it registers no procedures.
 */

export { cliArg, buildArgv, parseJsonDocument, parseJsonOutput, FLAG_NAME, type ArgValue } from "./argv.js";
export {
  cliToolOutputFields,
  cliToolOutputSchema,
  cliToolJsonOutputSchema,
  type CliToolOutput,
  type CliToolJsonOutput,
  type CliToolOutputFields,
} from "./output.js";
export { nodeScript, execPathProgram, findInPath, type CliProgram } from "./program.js";
export {
  defineCliTool,
  CliToolError,
  type CliTool,
  type CliToolOptions,
  type CliToolContext,
  type CliRunOptions,
  type CliShellInput,
} from "./tool.js";
