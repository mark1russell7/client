/**
 * The global flags of the `mark` CLI.
 *
 * `mark` reads a global flag before the command path. After the path, a flag is global only when
 * the procedure does not declare a flag of that name: `mark docker compose down -v` gives `-v` to
 * the procedure. `lib.audit` reports each procedure flag that hides a global flag in this way.
 *
 * This module has no side effects: `mark` imports it before it loads the procedures.
 */

export interface CliGlobalFlag {
  /** The long name, without "--" */
  readonly long: string;
  /** The short letter, without "-" */
  readonly short?: string;
  /** True when the flag takes a value */
  readonly takesValue: boolean;
  /** True when the flag starts a mode (the server or the REPL) and takes no command */
  readonly mode?: boolean;
  /** True when the flag is an option of `--server` */
  readonly serverOption?: boolean;
  /** The help text */
  readonly description: string;
}

export const CLI_GLOBAL_FLAGS: readonly CliGlobalFlag[] = [
  { long: "help", short: "h", takesValue: false, description: "Show the help" },
  { long: "version", short: "v", takesValue: false, description: "Show the version" },
  { long: "verbose", short: "V", takesValue: false, description: "Show more output" },
  { long: "format", short: "f", takesValue: true, description: "The output format: text, json, table or streaming" },
  { long: "local", takesValue: false, description: "Run the command in this process, not on the CLI server" },
  { long: "json", takesValue: true, description: "Run a procedure reference that is given as JSON" },
  { long: "interactive", short: "i", takesValue: false, mode: true, description: "Start the REPL" },
  { long: "server", takesValue: false, mode: true, description: "Start the CLI server" },
  { long: "port", takesValue: true, serverOption: true, description: "The port of the CLI server (with --server)" },
  { long: "host", takesValue: true, serverOption: true, description: "The host of the CLI server (with --server)" },
  {
    long: "transport",
    takesValue: true,
    serverOption: true,
    description: "The transport of the CLI server: http, websocket or both (with --server)",
  },
];

/** The global flag with this long name or short letter */
export function findGlobalFlag(name: string, short: boolean): CliGlobalFlag | undefined {
  return CLI_GLOBAL_FLAGS.find((flag) => (short ? flag.short === name : flag.long === name));
}
