/**
 * A command line for a procedure registry.
 *
 * `createProcedureCli()` makes a program from the procedures: the flags come from the input
 * schemas, and the help comes from the metadata. A missing argument is a question in a
 * terminal. A value `@<file>` is the text of the file. A format hook of a procedure writes its
 * human output.
 */

import { readFileSync } from "node:fs";
import {
  Client,
  LocalTransport,
  ProcedureRegistry,
  pathToKey,
  pathToMethod,
  type AnyProcedure,
  type Method,
} from "@procedures/client";
import { findChildren, parseCommandLine, type GlobalFlag, type Globals } from "./args.js";
import { askMissing, canAsk, missingFields, processTerminal, terminalAsker, type Asker, type Terminal } from "./ask.js";
import { failureOf } from "./failure.js";
import { fieldsOf, resultFieldsOf, type CLIMeta, type CommandLike } from "./fields.js";
import { formatOutput, plainPrint, type OutputFormat, type Print } from "./format.js";
import { generateHelp, groupHelp, rootHelp, validationMessage } from "./help.js";

/** The global flags of each program of `createProcedureCli()`. The option `globals` adds more. */
export const STANDARD_GLOBAL_FLAGS: readonly GlobalFlag[] = [
  { long: "help", short: "h", takesValue: false, description: "Show the help" },
  { long: "version", short: "v", takesValue: false, hidden: true, description: "Show the version" },
  { long: "format", short: "f", takesValue: true, description: "The output format: text, json, table or streaming" },
  { long: "json", takesValue: false, description: "Write the result as JSON (the same as --format json)" },
  { long: "data", takesValue: true, description: "The input as a JSON object, or @<file> for a file with the JSON object" },
  { long: "no-input", takesValue: false, description: "Never ask for a missing argument (also when CI is set)" },
];

const OUTPUT_FORMATS: readonly OutputFormat[] = ["text", "json", "table", "streaming"];

/** The commands of a program: a list of procedures or descriptions, or a registry. */
export type CommandSource = readonly CommandLike[] | { getAll(): readonly CommandLike[] };

/** The options of a call of a `CliClient`. */
export interface CliCallOptions {
  /** The signal that aborts the call. */
  signal?: AbortSignal | undefined;
}

/**
 * The client that runs the commands, for example a `Client` of `@procedures/client` over HTTP.
 * The command line uses `stream()` when the client has it, and else `call()`.
 */
export interface CliClient {
  /** This function gives each item of the result of a procedure. */
  stream?(method: Method, payload: unknown, options?: CliCallOptions): AsyncIterable<unknown>;
  /** This function gives the result of a procedure. */
  call?(method: Method, payload: unknown, options?: CliCallOptions): Promise<unknown>;
}

/** The data that a format hook gets. */
export interface FormatContext {
  /** The path of the command. */
  path: readonly string[];
  /** The input of the command. */
  input: unknown;
  /** The output format: `text` or `streaming`. */
  format: OutputFormat;
  /** The print functions of the program. */
  print: Print;
}

/**
 * A format hook writes the human output of one procedure. It gives a text or lines, and the
 * program prints them. Or it prints with `context.print` and gives nothing. The program uses a
 * hook only for the formats `text` and `streaming`. `--json` and `--format table` do not use it.
 */
export type FormatHook = (result: unknown, context: FormatContext) => string | readonly string[] | undefined | void;

/** The options of `createProcedureCli()`. */
export interface ProcedureCliOptions {
  /** The name of the program, as a person types it. */
  name: string;
  /** The version that `--version` shows. Without it, `--version` shows the help. */
  version?: string | undefined;
  /** The text after the name in the first line of the help. */
  description?: string | undefined;
  /**
   * The commands: procedures, descriptions of procedures, or a registry. A function gives them
   * when the program starts, for example from a lazy import.
   */
  procedures: CommandSource | (() => CommandSource | Promise<CommandSource>);
  /**
   * The client that runs the commands. A function makes the client from the global flags, for
   * example from `--port`. Without a client, the commands run in this process on the procedures.
   */
  client?: CliClient | ((globals: Globals) => CliClient | Promise<CliClient>) | undefined;
  /** More global flags. A flag with the long name of a standard flag replaces it. */
  globals?: readonly GlobalFlag[] | undefined;
  /** The format hooks, by the path of the procedure with dots, for example `"job.status"`. */
  format?: Readonly<Record<string, FormatHook>> | undefined;
  /** The print functions. The default writes plain text to the console. */
  print?: Print | undefined;
  /** The lines of the help after the list of the commands. */
  footer?: readonly string[] | undefined;
  /** The terminal state that decides if the program asks. Tests give a fake. */
  terminal?: Terminal | undefined;
  /** The function that asks one question. Tests give a fake. */
  ask?: Asker | undefined;
  /**
   * The function that reads a file for a value `@<file>`. The default reads the file as UTF-8.
   * `false` turns `@<file>` off: a value that starts with `@` stays text.
   */
  readFile?: ((path: string) => string) | false | undefined;
}

/** The options of one run. */
export interface ProcedureCliRunOptions {
  /** The signal that aborts the call of the command. */
  signal?: AbortSignal | undefined;
}

/** A program of `createProcedureCli()`. */
export interface ProcedureCli {
  /** The name of the program. */
  readonly name: string;
  /** The global flags of the program. */
  readonly globals: readonly GlobalFlag[];
  /**
   * This function starts one command line (without the program name) and gives the exit code.
   * The exit code is 1 for an unknown command, an invalid input, an error or a failed result.
   * Else the exit code is 0.
   */
  run(argv: readonly string[], options?: ProcedureCliRunOptions): Promise<number>;
}

/** This function gives the global flags: the standard flags, then the flags of the options. */
function mergeGlobals(extra: readonly GlobalFlag[]): GlobalFlag[] {
  const names = new Set(extra.map((flag) => flag.long));
  return [...STANDARD_GLOBAL_FLAGS.filter((flag) => !names.has(flag.long)), ...extra];
}

/** This function gives the list of a command source. */
function commandsOf(source: CommandSource): readonly CommandLike[] {
  return "getAll" in source ? source.getAll() : source;
}

/** This function gives the text of an error. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** This function makes a client in this process over the procedures of a source. */
function localClient(source: CommandSource): CliClient {
  let registry: ProcedureRegistry;
  if (source instanceof ProcedureRegistry) {
    registry = source;
  } else {
    registry = new ProcedureRegistry();
    for (const procedure of commandsOf(source)) registry.register(procedure as AnyProcedure);
  }
  const client = new Client({ transport: new LocalTransport({ registry }) }).useRegistry(registry);
  return {
    stream: (method, payload, options) => client.stream(method, payload, options?.signal ? { signal: options.signal } : {}),
  };
}

/** This function gives each item of the result of a call. */
async function* itemsOf(client: CliClient, method: Method, payload: unknown, options: CliCallOptions): AsyncIterable<unknown> {
  if (client.stream) {
    yield* client.stream(method, payload, options);
    return;
  }
  if (client.call) {
    yield await client.call(method, payload, options);
    return;
  }
  throw new Error("The client has no stream() and no call()");
}

/**
 * This function makes a command line for a procedure registry. The program gives help, `--json`,
 * questions for missing arguments, `@<file>` input and short flags from `meta.shorts`.
 *
 * @example
 * ```ts
 * const cli = createProcedureCli({ name: "tool", version: "1.0.0", procedures: registry });
 * process.exitCode = await cli.run(process.argv.slice(2));
 * ```
 */
export function createProcedureCli(options: ProcedureCliOptions): ProcedureCli {
  const { name } = options;
  const globalFlags = mergeGlobals(options.globals ?? []);
  const readFile = options.readFile === false ? undefined : (options.readFile ?? ((path: string) => readFileSync(path, "utf8")));

  const run = async (argv: readonly string[], runOptions: ProcedureCliRunOptions = {}): Promise<number> => {
    const print = options.print ?? plainPrint();
    let code = 0;
    const fail = (message: string, hint?: string): void => {
      print.error(message);
      if (hint) print.info(hint);
      code = 1;
    };

    try {
      const source = typeof options.procedures === "function" ? await options.procedures() : options.procedures;
      const commands = commandsOf(source);
      const parsed = parseCommandLine(argv, commands, { name, globals: globalFlags, readFile });
      const { path, procedure, globals } = parsed;
      const command = `${name} ${path.join(" ")}`;

      // An unknown command is the first problem to report
      if (path.length > 0 && !procedure) {
        const isGroup = findChildren(commands, path).length > 0;
        if (!isGroup || parsed.extraArguments.length > 0) {
          const words = [...path, ...parsed.extraArguments.slice(0, 1)];
          fail(`Unknown command: ${name} ${words.join(" ")}`, `Run '${name} --help' for available commands.`);
          return code;
        }
      }
      if (parsed.errors.length > 0) {
        for (const error of parsed.errors) print.error(error);
        print.info(`Run '${path.length > 0 ? `${command} --help` : `${name} --help`}' for the options.`);
        return 1;
      }

      if (globals["version"] === true && options.version !== undefined) {
        print.info(`${name} v${options.version}`);
        return 0;
      }

      const formatOverride = globals["json"] === true ? "json" : globals["format"] === undefined ? undefined : String(globals["format"]);
      if (formatOverride !== undefined && !OUTPUT_FORMATS.includes(formatOverride as OutputFormat)) {
        fail(`Invalid format: ${formatOverride}. Valid formats: ${OUTPUT_FORMATS.join(", ")}`);
        return code;
      }

      // The help of the program, of a group or of a command
      if (path.length === 0) {
        const title = `${name}${options.version !== undefined ? ` v${options.version}` : ""}${options.description ? ` - ${options.description}` : ""}`;
        for (const line of rootHelp(commands, { name, title, footer: options.footer })) print.info(line);
        return 0;
      }
      if (globals["help"] === true || !procedure) {
        if (procedure) {
          const meta = (procedure.metadata ?? {}) as CLIMeta;
          print.info(generateHelp(path, meta, fieldsOf(procedure), resultFieldsOf(procedure), { name, globals: globalFlags }));
        } else {
          for (const line of groupHelp(name, commands, path) ?? []) print.info(line);
        }
        return 0;
      }

      const meta = (procedure.metadata ?? {}) as CLIMeta;
      const outputFormat = (formatOverride ?? meta.output ?? "text") as OutputFormat;

      // --data: the input as one JSON object. The flags and the arguments go over its fields.
      let input = parsed.input;
      if (globals["data"] !== undefined) {
        let text = String(globals["data"]);
        if (text.startsWith("@") && !text.startsWith("@@") && text.length > 1) {
          if (!readFile) {
            fail(`--data ${text}: this program reads no files`);
            return code;
          }
          text = readFile(text.slice(1));
        } else if (text.startsWith("@@")) {
          text = text.slice(1);
        }
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch (error) {
          fail(`--data needs a JSON object: ${messageOf(error)}`);
          return code;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          fail("--data needs a JSON object");
          return code;
        }
        input = { ...(data as Record<string, unknown>), ...input };
      }

      // A required argument that is missing: in a terminal, the program asks for it
      const missing = missingFields(fieldsOf(procedure), input);
      if (missing.length > 0 && canAsk(globals["no-input"] === true, meta, options.terminal ?? processTerminal())) {
        const asked = await askMissing(missing, input, options.ask ?? terminalAsker);
        if (!asked.ok) {
          fail(asked.cancelled ? "Cancelled" : `Invalid input for ${command}:\n  ${asked.error}`);
          return code;
        }
        input = asked.input;
      }

      // A procedure with a schema validates the input here. A description without a schema
      // leaves the validation to the client.
      let validated: unknown = input;
      const schema = procedure.input as { parse?: (data: unknown) => unknown } | undefined;
      if (typeof schema?.parse === "function") {
        try {
          validated = schema.parse(input);
        } catch (error) {
          fail(`Invalid input for ${command}:\n  ${validationMessage(error)}`, `Run '${command} --help' for the options.`);
          return code;
        }
      } else {
        const stillMissing = missingFields(fieldsOf(procedure), input);
        if (stillMissing.length > 0) {
          const names = stillMissing.map((field) => `${field.name}: Required`).join("\n  ");
          fail(`Invalid input for ${command}:\n  ${names}`, `Run '${command} --help' for the options.`);
          return code;
        }
      }

      const client =
        options.client === undefined
          ? localClient(source)
          : typeof options.client === "function"
            ? await options.client(globals)
            : options.client;

      // Each item prints when it arrives. A failed item makes the command fail.
      const hook = outputFormat === "text" || outputFormat === "streaming" ? options.format?.[pathToKey(path)] : undefined;
      let failure: string | undefined;
      const printItem = (item: unknown): void => {
        const text = hook ? hook(item, { path, input: validated, format: outputFormat, print }) : undefined;
        if (typeof text === "string") {
          print.info(text);
        } else if (Array.isArray(text)) {
          for (const line of text as readonly string[]) print.info(line);
        } else if (!hook) {
          formatOutput(print, item, outputFormat);
        }
        failure ??= failureOf(item);
      };

      const spinner = outputFormat === "streaming" ? print.spin(`Running ${path.join(" ")}...`) : undefined;
      try {
        let items = 0;
        for await (const item of itemsOf(client, pathToMethod(path), validated, { signal: runOptions.signal })) {
          if (spinner && items === 0) spinner.stop();
          items++;
          printItem(item);
        }
        if (spinner) {
          if (failure === undefined) spinner.succeed(`${path.join(" ")} complete`);
          else spinner.fail(`${path.join(" ")} failed`);
        }
      } catch (error) {
        spinner?.stop();
        throw error;
      }
      if (failure !== undefined) {
        fail(`${command} failed: ${failure}`);
      }
    } catch (error) {
      fail(`Error: ${messageOf(error)}`);
    }
    return code;
  };

  return { name, globals: globalFlags, run };
}
