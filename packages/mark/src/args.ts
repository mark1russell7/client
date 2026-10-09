/**
 * Command Line Splitting
 *
 * Splits the argv of `mark` into the global flags, the command path, and the input of the
 * procedure. The rules (deep dive CLI-7, CLI-9, CLI-10, CLI-11):
 *
 * - A flag before the command path is a global flag.
 * - After the path, a flag is the procedure's when the procedure declares it (its field name, the
 *   kebab-case name, or its short letter). Otherwise it is a global flag. Otherwise it is an error.
 *   So `mark docker compose down -v` gives `-v` to the procedure, not to `--version`.
 * - Each value is converted by the type of its field: a string field keeps its text.
 * - A repeated array flag collects its values. A repeated record flag (`--env A=1 --env B=2`) merges.
 * - A boolean flag takes `true`/`false` after it, or `--flag=false`, or `--no-flag`.
 * - A negative number is a value, not a flag. `--` ends the flags.
 * - The positional fields take the arguments in order. A last array field takes the rest.
 *   An argument that no field takes is an error.
 */

import type { AnyProcedure } from "@mark1russell7/client";
import { findGlobalFlag, type CliGlobalFlag } from "@mark1russell7/client-lib/cli-flags";
import {
  convertValue,
  extractSchemaFields,
  mergeValue,
  toCamel,
  toKebab,
  type CLIMeta,
  type FieldType,
} from "./parse.js";

/** The long names of the global flags */
export type GlobalName =
  | "help"
  | "version"
  | "verbose"
  | "format"
  | "local"
  | "json"
  | "interactive"
  | "server"
  | "port"
  | "host"
  | "transport";

/** The global flags that the command line gives: true for a flag, text for a flag with a value */
export type Globals = Partial<Record<GlobalName, string | boolean>>;

export interface ParsedCommandLine {
  /** The command path */
  path: string[];
  /** The procedure at the path, if there is one */
  procedure: AnyProcedure | undefined;
  /** The procedure input, converted by the field types (not validated yet) */
  input: Record<string, unknown>;
  /** The global flags */
  globals: Globals;
  /** The arguments that no positional field took */
  extraArguments: string[];
  /** The problems, one message each */
  errors: string[];
}

const NEGATIVE_NUMBER = /^-(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const ANY: FieldType = { kind: "any" };

/** A token that is a flag (not a value, not a negative number, not "-" alone) */
function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-" && !NEGATIVE_NUMBER.test(token);
}

/**
 * Find a procedure matching the given path
 */
export function findProcedure(procedures: readonly AnyProcedure[], path: readonly string[]): AnyProcedure | undefined {
  return procedures.find((p) => p.path.length === path.length && p.path.every((seg, i) => seg === path[i]));
}

/**
 * Find procedures that are children of the given path
 */
export function findChildren(procedures: readonly AnyProcedure[], path: readonly string[]): AnyProcedure[] {
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
export function procedureFlags(procedure: AnyProcedure | undefined): ProcedureFlags {
  const meta = (procedure?.metadata ?? {}) as CLIMeta;
  const schemaFields = procedure ? extractSchemaFields(procedure.input) : [];
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
  flag: CliGlobalFlag,
  label: string,
  inline: string | undefined,
  reader: TokenReader,
  globals: Globals
): string | undefined {
  const name = flag.long as GlobalName;
  if (flag.takesValue) {
    const value = reader.takeValue(inline);
    if (value === undefined) {
      return `${label} needs a value`;
    }
    globals[name] = value;
    return undefined;
  }
  if (inline !== undefined && inline !== "true" && inline !== "false") {
    return `${label} needs true or false, not "${inline}"`;
  }
  globals[name] = inline !== "false";
  return undefined;
}

/**
 * Read the global flags before the command path. This needs no procedures: `mark` reads them
 * before it loads the procedures (`--version`, `--server`, `-i`).
 */
export function parseLeadingGlobals(argv: readonly string[]): { globals: Globals; rest: string[]; errors: string[] } {
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
    const flag = isLong || name.length === 1 ? findGlobalFlag(name, !isLong) : undefined;
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
 */
function readPath(tokens: readonly string[], procedures: readonly AnyProcedure[]): string[] {
  const path: string[] = [];
  for (const token of tokens) {
    if (isFlag(token) || token === "--") {
      break;
    }
    const testPath = [...path, token];
    if (findProcedure(procedures, testPath)) {
      path.push(token);
      break;
    }
    if (findChildren(procedures, testPath).length > 0 || path.length === 0) {
      path.push(token);
      continue;
    }
    break;
  }
  return path;
}

/**
 * Split a whole command line: global flags, the command path, and the procedure input
 */
export function parseCommandLine(argv: readonly string[], procedures: readonly AnyProcedure[]): ParsedCommandLine {
  const leading = parseLeadingGlobals(argv);
  const globals = leading.globals;
  const errors = [...leading.errors];
  const path = readPath(leading.rest, procedures);
  const procedure = findProcedure(procedures, path);
  const flags = procedureFlags(procedure);
  const input: Record<string, unknown> = {};
  const fromFlag = new Set<string>();
  const positionals: string[] = [];

  const setField = (spec: FlagSpec, text: string, label: string): void => {
    const converted = convertValue(text, spec.type, label);
    if (!converted.ok) {
      errors.push(converted.error);
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
    const where = path.length > 0 ? ` for mark ${path.join(" ")}` : "";
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
      const global = findGlobalFlag(name, false);
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
      const global = spec ? undefined : findGlobalFlag(letter, true);
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
        globals[global!.long as GlobalName] = true;
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
      if (many && texts.length > 1) {
        const items: unknown[] = [];
        for (const text of texts) {
          const converted = convertValue(text, type.item ?? ANY, field);
          if (!converted.ok) {
            errors.push(converted.error);
            return;
          }
          items.push(converted.value);
        }
        value = items;
      } else {
        const converted = convertValue(texts[0]!, type, field);
        if (!converted.ok) {
          errors.push(converted.error);
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
      `Unexpected argument${extraArguments.length > 1 ? "s" : ""} for mark ${path.join(" ")}: ${extraArguments.join(" ")}`
    );
  }

  return { path, procedure, input, globals, extraArguments, errors };
}
