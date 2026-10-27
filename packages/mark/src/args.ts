/**
 * Command Line Splitting
 *
 * Splits the argv of `mark` into the global flags, the command path, and the input of the
 * procedure. The rules are in `@procedures/cli-kit` (roadmap O61): this module gives them the
 * name `mark` and the global flags of mark (`@procedures/lib/cli-flags`).
 */

import { CLI_GLOBAL_FLAGS } from "@procedures/lib/cli-flags";
import {
  parseCommandLine as kitParseCommandLine,
  parseLeadingGlobals as kitParseLeadingGlobals,
  type CommandLike,
  type ParsedCommandLine as KitParsedCommandLine,
} from "@procedures/cli-kit";

export { findChildren, findProcedure, procedureFlags } from "@procedures/cli-kit";

/** The long names of the global flags */
export type GlobalName =
  | "help"
  | "version"
  | "verbose"
  | "format"
  | "local"
  | "json"
  | "no-input"
  | "fs-root"
  | "interactive"
  | "server"
  | "port"
  | "host"
  | "transport"
  | "events"
  | "probe-port"
  | "idle-timeout";

/** The global flags that the command line gives: true for a flag, text for a flag with a value */
export type Globals = Partial<Record<GlobalName, string | boolean>>;

export interface ParsedCommandLine<T extends CommandLike = CommandLike> extends Omit<KitParsedCommandLine<T>, "globals"> {
  /** The global flags */
  globals: Globals;
}

/** The options of the parse of mark: its name and its global flags. A value `@<file>` stays text. */
const MARK = { name: "mark", globals: CLI_GLOBAL_FLAGS } as const;

/**
 * Read the global flags before the command path. This needs no procedures: `mark` reads them
 * before it loads the procedures (`--version`, `--server`, `-i`).
 */
export function parseLeadingGlobals(argv: readonly string[]): { globals: Globals; rest: string[]; errors: string[] } {
  return kitParseLeadingGlobals(argv, MARK) as { globals: Globals; rest: string[]; errors: string[] };
}

/**
 * Split a whole command line: global flags, the command path, and the procedure input
 */
export function parseCommandLine<T extends CommandLike>(argv: readonly string[], procedures: readonly T[]): ParsedCommandLine<T> {
  return kitParseCommandLine(argv, procedures, MARK) as ParsedCommandLine<T>;
}
