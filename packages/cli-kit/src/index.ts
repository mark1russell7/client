/**
 * `@procedures/cli-kit`: a command line for any procedure registry.
 *
 * The package has no procedures, and an import registers nothing. `createProcedureCli()` makes
 * a whole program. The other exports are its parts: the parse, the help, the questions and the
 * output. The `mark` CLI uses the parts.
 */

export {
  createProcedureCli,
  STANDARD_GLOBAL_FLAGS,
  type CliCallOptions,
  type CliClient,
  type CommandSource,
  type FormatContext,
  type FormatHook,
  type ProcedureCli,
  type ProcedureCliOptions,
  type ProcedureCliRunOptions,
} from "./cli.js";
export {
  findChildren,
  findGlobalFlag,
  findProcedure,
  parseCommandLine,
  parseLeadingGlobals,
  procedureFlags,
  type GlobalFlag,
  type Globals,
  type ParsedCommandLine,
  type ParseOptions,
} from "./args.js";
export {
  convertValue,
  extractSchemaFields,
  fieldTypeOf,
  fieldsOf,
  mergeValue,
  resultFieldsOf,
  resultFieldsOfSchema,
  toCamel,
  toKebab,
  type CLIMeta,
  type CommandLike,
  type Converted,
  type FieldKind,
  type FieldType,
  type SchemaFieldInfo,
} from "./fields.js";
export {
  generateHelp,
  groupHelp,
  rootHelp,
  validationMessage,
  type HelpOptions,
  type RootHelpOptions,
} from "./help.js";
export {
  askMissing,
  canAsk,
  missingFields,
  processTerminal,
  questionOf,
  terminalAsker,
  type Answer,
  type Asked,
  type Asker,
  type Terminal,
} from "./ask.js";
export { formatOutput, plainPrint, type OutputFormat, type Print, type Spinner } from "./format.js";
export { failureOf } from "./failure.js";
