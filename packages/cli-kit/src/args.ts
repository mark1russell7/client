/**
 * Command Line Splitting
 *
 * This module splits the argv of a program into the global flags, the command path, and the
 * input of the procedure. The rules (deep dive CLI-7, CLI-9, CLI-10, CLI-11):
 *
 * - A flag before the command path is a global flag.
 * - After the path, a flag is the procedure's when the procedure declares it (its field name, the
 *   kebab-case name, or its short letter). Otherwise it is a global flag. Otherwise it is an error.
 *   So `mark docker compose down -v` gives `-v` to the procedure, not to `--version`.
 * - Each value is converted by the type of its field: a string field keeps its text.
 * - A repeated array flag collects its values. A repeated record flag (`--env A=1 --env B=2`) merges.
 * - A boolean flag takes `true`/`false` after it, or `--flag=false`, or `--no-flag`.
 * - A repeated global flag with a value keeps the last value. A repeatable one (`--events`)
 *   collects its values, separated by commas.
 * - A negative number is a value, not a flag. `--` ends the flags.
 * - The positional fields take the arguments in order. A last array field takes the rest.
 *   An argument that no field takes is an error.
 * - With `readFile`, a value `@<file>` is the text of the file. A value `@@<text>` is the text `@<text>`.
 */

import {
  convertValue,
  fieldsOf,
  mergeValue,
  toCamel,
  toKebab,
  type CLIMeta,
  type CommandLike,
  type FieldType,
} from "./fields.js";

/** A global flag of a program: a flag that applies to each command. */
export interface GlobalFlag {
  /** The long name, without "--" */
  readonly long: string;
  /** The short letter, without "-" */
  readonly short?: string | undefined;
  /** True when the flag takes a value */
  readonly takesValue: boolean;
  /** True when the flag can be given more than one time: its values add up, separated by commas */
  readonly repeatable?: boolean | undefined;
  /** True when the help of a command does not list the flag */
  readonly hidden?: boolean | undefined;
  /** The help text */
  readonly description: string;
}

/** This function finds the global flag with this long name, or with this short letter. */
export function findGlobalFlag(globals: readonly GlobalFlag[], name: string, short: boolean): GlobalFlag | undefined {
  return globals.find((flag) => (short ? flag.short === name : flag.long === name));
}

/** The global flags that the command line gives: true for a flag, text for a flag with a value */
export type Globals = Record<string, string | boolean | undefined>;

/** The options of the parse of a command line. */
export interface ParseOptions {
  /** The name of the program, for the messages. */
  name: string;
  /** The global flags of the program. */
  globals: readonly GlobalFlag[];
  /**
   * The function that reads a file for a value `@<file>`. Without it, a value that starts with
   * `@` stays text.
   */
  readFile?: ((path: string) => string) | undefined;
}

/** The result of the parse of a command line. */
export interface ParsedCommandLine<T extends CommandLike = CommandLike> {
  /** The command path */
  path: string[];
  /** The procedure at the path, if there is one */
  procedure: T | undefined;
  /** The procedure input, converted by the field types (not validated yet) */
  input: Record<string, unknown>;
  /** The global flags */
  globals: Globals;
  /** The arguments that no positional field took */
  extraArguments: string[];
  /** The problems, one message each */
  errors: string[];
}

// The digits before the point and the digits after it are two groups, so each token has one match
const NEGATIVE_NUMBER = /^-(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const ANY: FieldType = { kind: "any" };

/** A token that is a flag (not a value, not a negative number, not "-" alone) */
function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-" && !NEGATIVE_NUMBER.test(token);
}

/**
 * Find a procedure matching the given path
 */
export function findProcedure<T extends CommandLike>(procedures: readonly T[], path: readonly string[]): T | undefined {
  return procedures.find((p) => p.path.length === path.length && p.path.every((seg, i) => seg === path[i]));
}

/**
 * Find procedures that are children of the given path
 */
export function findChildren<T extends CommandLike>(procedures: readonly T[], path: readonly string[]): T[] {
  return procedures.filter((p) => p.path.length > path.length && path.every((seg, i) => seg === p.path[i]));
}

interface FlagSpec {
  field: string;
  type: FieldType;
}

interface ProcedureFlags {
  long: Map<string, FlagSpec>;
  short: Map<string, FlagSpec>;
  /** The field types by field name */
  fields: Map<string, FieldType>;
  /** True when the schema has readable fields: then an unknown flag is an error */
  typed: boolean;
  meta: CLIMeta;
}

/**
 * The flags a procedure declares: each field of its input schema (camelCase and kebab-case
 * names) and the short letters of its metadata.
 */
export function procedureFlags(procedure: CommandLike | undefined): ProcedureFlags {
  const meta = (procedure?.metadata ?? {}) as CLIMeta;
  const schemaFields = procedure ? fieldsOf(procedure) : [];
  const fields = new Map(schemaFields.map((field) => [field.name, field.fieldType]));
  const long = new Map<string, FlagSpec>();
  const short = new Map<string, FlagSpec>();

  const addLong = (field: string): void => {
    const spec = { field, type: fields.get(field) ?? ANY };
    long.set(field, spec);
    long.set(toKebab(field), spec);
  };
  for (const field of fields.keys()) {
    addLong(field);
  }
  for (const [field, letter] of Object.entries(meta.shorts ?? {})) {
    if (!long.has(field)) {
      addLong(field);
    }
    short.set(letter, { field, type: fields.get(field) ?? ANY });
  }

  return { long, short, fields, typed: schemaFields.length > 0, meta };
}

/** The state of one pass over the tokens */
class TokenReader {
  index = 0;
  constructor(readonly tokens: readonly string[]) {}

  get current(): string | undefined {
    return this.tokens[this.index];
  }

  /** The value of a flag: the inline value, or the next token when it is not a flag */
  takeValue(inline: string | undefined): string | undefined {
    if (inline !== undefined) {
      return inline;
    }
    const next = this.tokens[this.index + 1];
    if (next !== undefined && !isFlag(next)) {
      this.index++;
      return next;
    }
    return undefined;
  }

  /** The value of a boolean flag: the inline value, or a next token that is "true" or "false" */
  takeBoolean(inline: string | undefined): string | undefined {
    if (inline !== undefined) {
      return inline;
    }
    const next = this.tokens[this.index + 1];
    if (next === "true" || next === "false") {
      this.index++;
      return next;
    }
    return undefined;
  }
}

/** Split "--name=value" (or "-n=value") into the name and the inline value */
function splitInline(body: string): { name: string; inline: string | undefined } {
  const eq = body.indexOf("=");
  return eq === -1 ? { name: body, inline: undefined } : { name: body.slice(0, eq), inline: body.slice(eq + 1) };
}

/** Read one global flag. Returns an error message, or undefined. */
function readGlobal(
  flag: GlobalFlag,
  label: string,
  inline: string | undefined,
  reader: TokenReader,
  globals: Globals
): string | undefined {
  const name = flag.long;
  if (flag.takesValue) {
    const value = reader.takeValue(inline);
    if (value === undefined) {
      return `${label} needs a value`;
    }
    // A repeatable flag (--events) collects its values, separated by commas
    const previous = globals[name];
    globals[name] = flag.repeatable && typeof previous === "string" ? `${previous},${value}` : value;
    return undefined;
  }
  if (inline !== undefined && inline !== "true" && inline !== "false") {
    return `${label} needs true or false, not "${inline}"`;
  }
  globals[name] = inline !== "false";
  return undefined;
}

/**
 * This function reads the global flags before the command path. It needs no procedures: `mark`
 * reads them before it loads the procedures (`--version`, `--server`, `-i`).
 */
export function parseLeadingGlobals(
  argv: readonly string[],
  options: Pick<ParseOptions, "globals">
): { globals: Globals; rest: string[]; errors: string[] } {
  const globals: Globals = {};
  const errors: string[] = [];
  const reader = new TokenReader(argv);

  for (; reader.index < argv.length; reader.index++) {
    const token = reader.current!;
    if (!isFlag(token) || token === "--") {
      break;
    }
    const isLong = token.startsWith("--");
    const { name, inline } = splitInline(token.slice(isLong ? 2 : 1));
    const flag = isLong || name.length === 1 ? findGlobalFlag(options.globals, name, !isLong) : undefined;
    if (!flag) {
      errors.push(`Unknown option before the command: ${token}`);
      continue;
    }
    const error = readGlobal(flag, isLong ? `--${name}` : `-${name}`, inline, reader, globals);
    if (error) {
      errors.push(error);
    }
  }

  const rest = argv.slice(reader.index);
  if (rest[0] === "--") {
    rest.shift();
  }
  return { globals, rest, errors };
}

/**
 * The command path at the start of the tokens: the longest run of words that names a procedure
 * or a group of procedures. The first word is part of the path even when it names nothing (the
 * command is then unknown).
 *
 * A procedure can also be a group: `fs read` and `fs read json` are both procedures (roadmap
 * CLI-75). The words go on while a longer path can match, and the path is the longest one that
 * names a procedure. Thus `fs read json` names `fs.read.json`, and `fs read notes.txt` names
 * `fs.read` with the argument `notes.txt`.
 */
function readPath(tokens: readonly string[], procedures: readonly CommandLike[]): string[] {
  const path: string[] = [];
  // The length of the longest path that names a procedure
  let named = 0;
  for (const token of tokens) {
    if (isFlag(token) || token === "--") {
      break;
    }
    const testPath = [...path, token];
    const procedure = findProcedure(procedures, testPath) !== undefined;
    const group = findChildren(procedures, testPath).length > 0;
    if (!procedure && !group && path.length > 0) {
      break;
    }
    path.push(token);
    if (procedure) named = path.length;
    if (!group) {
      break;
    }
  }
  return named > 0 ? path.slice(0, named) : path;
}

/**
 * This function splits a whole command line: the global flags, the command path, and the
 * procedure input.
 */
export function parseCommandLine<T extends CommandLike>(
  argv: readonly string[],
  procedures: readonly T[],
  options: ParseOptions
): ParsedCommandLine<T> {
  const { name: program, globals: globalFlags, readFile } = options;
  const leading = parseLeadingGlobals(argv, options);
  const globals = leading.globals;
  const errors = [...leading.errors];
  const path = readPath(leading.rest, procedures);
  const procedure = findProcedure(procedures, path);
  const flags = procedureFlags(procedure);
  const input: Record<string, unknown> = {};
  const fromFlag = new Set<string>();
  const positionals: string[] = [];

  /** The text of a value: the text of a file for `@<file>`, when the options can read files. */
  const textOf = (text: string, label: string): string | undefined => {
    if (!readFile || !text.startsWith("@") || text.length < 2) {
      return text;
    }
    if (text.startsWith("@@")) {
      return text.slice(1);
    }
    try {
      return readFile(text.slice(1));
    } catch (error) {
      errors.push(`${label}: cannot read ${text.slice(1)}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  /** The conversion of a value, after `textOf()`. An error goes to `errors`. */
  const convert = (raw: string, type: FieldType, label: string): { ok: true; value: unknown } | { ok: false } => {
    const text = type.kind === "boolean" ? raw : textOf(raw, label);
    if (text === undefined) {
      return { ok: false };
    }
    const converted = convertValue(text, type, label);
    if (!converted.ok) {
      errors.push(converted.error);
      return { ok: false };
    }
    return converted;
  };

  const setField = (spec: FlagSpec, raw: string, label: string): void => {
    const converted = convert(raw, spec.type, label);
    if (!converted.ok) {
      return;
    }
    input[spec.field] = mergeValue(input[spec.field], converted.value, spec.type);
    fromFlag.add(spec.field);
  };

  /** Read one procedure flag. Returns false when the procedure does not declare it. */
  const readProcedureFlag = (
    spec: FlagSpec | undefined,
    label: string,
    inline: string | undefined,
    reader: TokenReader
  ): boolean => {
    if (!spec) {
      return false;
    }
    if (spec.type.kind === "boolean") {
      setField(spec, reader.takeBoolean(inline) ?? "true", label);
      return true;
    }
    const value = reader.takeValue(inline);
    if (value === undefined) {
      errors.push(`${label} needs a value`);
      return true;
    }
    setField(spec, value, label);
    return true;
  };

  /** A flag that neither the procedure nor the globals have */
  const readOther = (name: string, label: string, inline: string | undefined, reader: TokenReader): void => {
    if (procedure && !flags.typed) {
      // The schema has no readable fields: pass the flag through, as JSON or text
      const value = reader.takeValue(inline);
      setField({ field: toCamel(name), type: ANY }, value ?? "true", label);
      return;
    }
    const where = path.length > 0 ? ` for ${program} ${path.join(" ")}` : "";
    errors.push(`Unknown option${where}: ${label}`);
  };

  const reader = new TokenReader(leading.rest);
  reader.index = path.length;
  let onlyPositionals = false;

  for (; reader.index < leading.rest.length; reader.index++) {
    const token = reader.current!;

    if (onlyPositionals || !isFlag(token)) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      onlyPositionals = true;
      continue;
    }

    if (token.startsWith("--")) {
      const { name, inline } = splitInline(token.slice(2));
      const label = `--${name}`;
      if (readProcedureFlag(flags.long.get(name), label, inline, reader)) {
        continue;
      }
      // --no-<flag> sets a boolean field to false
      const negated = name.startsWith("no-") ? flags.long.get(name.slice(3)) : undefined;
      if (negated?.type.kind === "boolean") {
        if (inline !== undefined) {
          errors.push(`${label} takes no value`);
        } else {
          setField(negated, "false", label);
        }
        continue;
      }
      const global = findGlobalFlag(globalFlags, name, false);
      if (global) {
        const error = readGlobal(global, label, inline, reader, globals);
        if (error) errors.push(error);
        continue;
      }
      readOther(name, label, inline, reader);
      continue;
    }

    // Short flags: "-x", "-x=value", "-xvalue" (a flag with a value), or "-abc" (boolean flags)
    const { name: body, inline } = splitInline(token.slice(1));
    for (let k = 0; k < body.length; k++) {
      const letter = body[k]!;
      const label = `-${letter}`;
      const last = k === body.length - 1;
      const attached = last ? inline : body.slice(k + 1);
      const spec = flags.short.get(letter);
      const global = spec ? undefined : findGlobalFlag(globalFlags, letter, true);
      const takesValue = spec ? spec.type.kind !== "boolean" : global?.takesValue === true;

      if (!spec && !global) {
        if (body.length === 1) {
          readOther(letter, label, inline, reader);
        } else {
          errors.push(`Unknown option ${label} in ${token}`);
        }
        break;
      }
      if (takesValue || last) {
        // The rest of the token (or the next token) is the value of this flag
        if (spec) {
          readProcedureFlag(spec, label, attached === "" ? undefined : attached, reader);
        } else {
          const error = readGlobal(global!, label, attached === "" ? undefined : attached, reader, globals);
          if (error) errors.push(error);
        }
        break;
      }
      if (spec) {
        setField(spec, "true", label);
      } else {
        globals[global!.long] = true;
      }
    }
  }

  // Positional fields take the arguments in order; a last array field takes the rest
  const positionalFields = flags.meta.args ?? [];
  let next = 0;
  if (procedure) {
    positionalFields.forEach((field, k) => {
      if (next >= positionals.length) {
        return;
      }
      const type = flags.fields.get(field) ?? ANY;
      const many = type.kind === "array" && k === positionalFields.length - 1;
      const texts = many ? positionals.slice(next) : [positionals[next]!];
      next += texts.length;
      if (fromFlag.has(field)) {
        errors.push(`${field} is given twice: as an argument and as --${toKebab(field)}`);
        return;
      }
      let value: unknown;
      // Each argument of a last array field is one item, also when there is only one. Before, one
      // argument was converted as the whole array, so `[]` gave no item and `["a","b"]` two.
      if (many) {
        const items: unknown[] = [];
        for (const text of texts) {
          const converted = convert(text, type.item ?? ANY, field);
          if (!converted.ok) {
            return;
          }
          items.push(converted.value);
        }
        value = items;
      } else {
        const converted = convert(texts[0]!, type, field);
        if (!converted.ok) {
          return;
        }
        value = converted.value;
      }
      input[field] = value;
    });
  }
  const extraArguments = positionals.slice(next);
  if (procedure && extraArguments.length > 0) {
    errors.push(
      `Unexpected argument${extraArguments.length > 1 ? "s" : ""} for ${program} ${path.join(" ")}: ${extraArguments.join(" ")}`
    );
  }

  return { path, procedure, input, globals, extraArguments, errors };
}
