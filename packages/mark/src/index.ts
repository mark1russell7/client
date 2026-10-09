/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures from client packages.
 * Importing this module runs nothing: the `mark` bin (`dist/bin.js`) runs the CLI.
 */

export { run, main, executeArgs, initCli, type CliContext } from "./cli.js";
export { parseCommandLine, parseLeadingGlobals, type ParsedCommandLine, type Globals } from "./args.js";
export { failureOf } from "./failure.js";
export {
  parseFromSchema,
  generateHelp,
  extractSchemaFields,
  convertValue,
  type CLIMeta,
  type FieldType,
  type SchemaFieldInfo,
} from "./parse.js";
export { formatOutput, type OutputFormat } from "./format.js";
export {
  readLockfile,
  writeLockfile,
  removeLockfile,
  isServerAlive,
  getLockfilePath,
  getLockfileDir,
  getLogPath,
  rotateLogFile,
  type LockfileData,
} from "./lockfile.js";
