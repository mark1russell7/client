#!/usr/bin/env node
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * Uses custom procedure-based routing with modern terminal utilities.
 */

import { print } from "./print.js";
import type { Method, AnyProcedure } from "@mark1russell7/client";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateHelp, type CLIMeta } from "./parse.js";
import { formatOutput, type OutputFormat, type Print } from "./format.js";
import { loadEcosystemProcedures } from "./ecosystem.js";
import { startServerMode, parsePort, parseTransport } from "./server-mode.js";
import { tryClientMode } from "./client-mode.js";
import { startRepl } from "./repl.js";
import { findChildren, findProcedure, parseCommandLine, parseLeadingGlobals } from "./args.js";
import { failureOf } from "./failure.js";

const VERSION = "1.0.0";

/**
 * Convert procedure path to transport method
 */
function pathToMethod(path: string[]): Method {
  const [service, ...rest] = path;
  return { service: service!, operation: rest.join(".") };
}

const OUTPUT_FORMATS: readonly OutputFormat[] = ["text", "json", "table", "streaming"];

/**
 * Report a problem of the command line or of the command: print it and set exit code 1
 */
function fail(message: string, hint?: string): void {
  print.error(message);
  if (hint) {
    print.info(hint);
  }
  process.exitCode = 1;
}

/**
 * The message of a validation error: one line for each issue of a Zod error
 */
function validationMessage(error: unknown): string {
  const issues = (error as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map((issue) => `${(issue.path ?? []).join(".") || "input"}: ${issue.message ?? "invalid"}`)
      .join("\n  ");
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Show help for a path (either a command or a group). Returns false for an unknown path.
 */
function showHelp(procedures: AnyProcedure[], path: string[]): boolean {
  const proc = findProcedure(procedures, path);

  if (proc) {
    // Show help for specific command with schema introspection
    const meta = (proc.metadata ?? {}) as CLIMeta;
    print.info(generateHelp(path, meta, proc.input));
    return true;
  }

  // Show help for group
  const children = findChildren(procedures, path);
  if (children.length > 0) {
    const groupName = path.join(" ");
    print.info(`${groupName} commands:\n`);

    // Direct children only
    const directChildren = children.filter((p) => p.path.length === path.length + 1);
    for (const child of directChildren) {
      const meta = (child.metadata ?? {}) as CLIMeta;
      const cmdName = child.path[child.path.length - 1] ?? "";
      const desc = meta.description ?? "";
      print.info(`  mark ${groupName} ${cmdName}  ${desc}`);
    }

    // Child groups
    const childGroups = new Set<string>();
    for (const child of children) {
      if (child.path.length > path.length + 1) {
        const groupSeg = child.path[path.length];
        if (groupSeg) childGroups.add(groupSeg);
      }
    }
    for (const group of childGroups) {
      print.info(`  mark ${groupName} ${group}  ${group} commands`);
    }

    print.info(`\nRun 'mark ${groupName} <command> --help' for more info.`);
    return true;
  }

  // Unknown command
  fail(`Unknown command: mark ${path.join(" ")}`, "Run 'mark --help' for available commands.");
  return false;
}

/**
 * Show root help
 */
function showRootHelp(procedures: AnyProcedure[]): void {
  print.info(`mark v${VERSION} - Development workflow automation\n`);
  print.info("Commands:\n");

  // Group by first path segment
  const groups = new Map<string, AnyProcedure[]>();
  for (const proc of procedures) {
    const group = proc.path[0] ?? "other";
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(proc);
  }

  for (const [group, procs] of groups) {
    print.info(`  ${group}`);
    for (const proc of procs) {
      const meta = (proc.metadata ?? {}) as CLIMeta;
      const cmdPath = proc.path.join(" ");
      const desc = meta.description ?? "";
      print.info(`    mark ${cmdPath}  ${desc}`);
    }
    print.info("");
  }

  print.info("Run 'mark <command> --help' for more information.");
  print.info("Modes: 'mark --server [--port N] [--host H] [--transport http|websocket|both]' and 'mark -i' (the REPL).");
}

/**
 * CLI execution context, created once and reused
 */
export interface CliContext {
  client: InstanceType<typeof import("@mark1russell7/client").Client>;
  procedures: AnyProcedure[];
  verbose: boolean;
}

/**
 * Initialize the CLI context (load ecosystem, create client)
 * This is the expensive part (~4s). Call once, reuse many times.
 */
export async function initCli(verbose = false): Promise<CliContext> {
  const clientModule = await import("@mark1russell7/client");
  const { Client, LocalTransport, PROCEDURE_REGISTRY } = clientModule;

  await loadEcosystemProcedures(verbose);

  // The transport runs each procedure of the registry through invokeProcedure() (ARCHITECTURE-PROPOSALS P1)
  const transport = new LocalTransport({ registry: PROCEDURE_REGISTRY });
  const client = new Client({ transport });

  const procedures = PROCEDURE_REGISTRY.getAll();

  return { client, procedures, verbose };
}

/**
 * Execute a single command given argv tokens.
 * Reusable by both CLI entry point and REPL.
 *
 * The exit code is 1 for an unknown command, a problem of the command line, invalid input, a
 * thrown error, and a result that reports a failure (`success: false`, or an `exitCode` that is
 * not 0: see failure.ts). Before, all of these exited with 0 (deep dive CLI-8).
 */
export async function executeArgs(argv: string[], ctx: CliContext): Promise<void> {
  const { client, procedures } = ctx;

  // Global flags, path and procedure input, converted by the field types (deep dive CLI-7, 9, 10, 11)
  const parsed = parseCommandLine(argv, procedures);
  const { path, procedure, globals } = parsed;

  // An unknown command is the first problem to report
  if (path.length > 0 && !procedure) {
    const isGroup = findChildren(procedures, path).length > 0;
    if (!isGroup || parsed.extraArguments.length > 0) {
      const words = [...path, ...parsed.extraArguments.slice(0, 1)];
      fail(`Unknown command: mark ${words.join(" ")}`, "Run 'mark --help' for available commands.");
      return;
    }
  }

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      print.error(error);
    }
    const helpPath = path.length > 0 ? `mark ${path.join(" ")} --help` : "mark --help";
    print.info(`Run '${helpPath}' for the options.`);
    process.exitCode = 1;
    return;
  }

  // The modes start before the procedures load: here they are misplaced
  if (globals.server || globals.interactive) {
    fail("--server and -i start a mode of mark: give them alone, before any command.");
    return;
  }
  if (globals.port !== undefined || globals.host !== undefined || globals.transport !== undefined) {
    fail("--port, --host and --transport are options of --server.");
    return;
  }

  if (globals.version) {
    print.info(`mark v${VERSION}`);
    return;
  }

  // Output format: --format/-f, unless the procedure declares a flag of that name
  const formatOverride = globals.format === undefined ? undefined : String(globals.format);
  if (formatOverride !== undefined && !OUTPUT_FORMATS.includes(formatOverride as OutputFormat)) {
    fail(`Invalid format: ${formatOverride}. Valid formats: ${OUTPUT_FORMATS.join(", ")}`);
    return;
  }

  // Handle --json flag for raw procedure reference execution
  if (globals.json !== undefined) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(String(globals.json));
    } catch (e) {
      fail(`Failed to parse --json input: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!parsedJson || typeof parsedJson !== "object" || !("$proc" in parsedJson)) {
      fail('--json needs a procedure reference: an object with "$proc".');
      return;
    }
    try {
      const result = await client.exec(parsedJson as Parameters<typeof client.exec>[0]);
      formatOutput(print as unknown as Print, result, "json");
      if (failureOf(result)) {
        process.exitCode = 1;
      }
    } catch (error) {
      fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }

  // Handle root help
  if (path.length === 0) {
    showRootHelp(procedures);
    return;
  }

  // Help for a command or a group (a group without a command shows its help too)
  if (globals.help || !procedure) {
    showHelp(procedures, path);
    return;
  }

  const meta = (procedure.metadata ?? {}) as CLIMeta;
  const outputFormat = (formatOverride ?? meta.output ?? "text") as OutputFormat;

  let validated: unknown = parsed.input;
  try {
    if (procedure.input) {
      validated = procedure.input.parse(parsed.input);
    }
  } catch (error) {
    fail(`Invalid input for mark ${path.join(" ")}:\n  ${validationMessage(error)}`, `Run 'mark ${path.join(" ")} --help' for the options.`);
    return;
  }

  // Each item prints when it arrives. A failed item makes the command fail.
  let failure: string | undefined;
  const printItem = (item: unknown): void => {
    formatOutput(print as unknown as Print, item, outputFormat);
    failure ??= failureOf(item);
  };
  const reportFailure = (): void => {
    if (failure !== undefined) {
      fail(`mark ${path.join(" ")} failed: ${failure}`);
    }
  };

  // Try client mode: connect to running server if available (unless --local)
  if (!globals.local) {
    const clientResult = await tryClientMode(path, validated, printItem);
    if (clientResult !== null) {
      if (clientResult.success) {
        if (!clientResult.printed) {
          printItem(clientResult.result);
        }
        reportFailure();
        return;
      }
      // The server ran (or started to run) the command and it failed. Running it again
      // locally could repeat its side effects, so report the error instead.
      fail(clientResult.error ?? "The command failed on the CLI server.");
      return;
    }
  }

  try {
    let spinner: ReturnType<typeof print.spin> | undefined;

    if (outputFormat === "streaming") {
      spinner = print.spin(`Running ${path.join(" ")}...`);
    }

    const method = pathToMethod(path);

    // A streaming procedure gives many items: print each one when it arrives. A
    // request/response procedure gives one item, so its output does not change.
    let items = 0;
    for await (const item of client.stream(method, validated)) {
      if (spinner && items === 0) spinner.stop();
      items++;
      printItem(item);
    }

    if (spinner) {
      if (failure === undefined) {
        spinner.succeed(`${path.join(" ")} complete`);
      } else {
        spinner.fail(`${path.join(" ")} failed`);
      }
    }
    reportFailure();
  } catch (error) {
    fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Run the CLI
 */
async function run(argv: string[]): Promise<void> {
  // The global flags before the command: read without loading the procedures
  const leading = parseLeadingGlobals(argv);
  if (leading.errors.length > 0) {
    for (const error of leading.errors) {
      print.error(error);
    }
    print.info("Run 'mark --help' for the options.");
    process.exitCode = 1;
    return;
  }
  const globals = leading.globals;
  const verbose = globals.verbose === true;

  // Handle --version early (no imports needed)
  if (globals.version) {
    print.info(`mark v${VERSION}`);
    return;
  }

  // Handle --server flag: start server mode
  if (globals.server) {
    if (leading.rest.length > 0) {
      fail(`--server takes no command: ${leading.rest.join(" ")}`);
      return;
    }
    const port = globals.port === undefined ? 3000 : parsePort(String(globals.port));
    // Loopback unless --host says otherwise (deep dive CLI-1)
    const host = globals.host === undefined ? "127.0.0.1" : String(globals.host);
    const transport = globals.transport === undefined ? "http" : parseTransport(String(globals.transport));
    await startServerMode({ port, host, transport, verbose });
    return;
  }

  // Handle -i / --interactive flag: start REPL
  if (globals.interactive) {
    if (leading.rest.length > 0) {
      fail(`-i takes no command: ${leading.rest.join(" ")}`);
      return;
    }
    await startRepl({ verbose });
    return;
  }

  // Normal CLI: init once, execute once
  const ctx = await initCli(verbose);
  await executeArgs(argv, ctx);
}

/**
 * Run the CLI and report an error that escapes it as one line, with exit code 1. With
 * `--verbose`, the stack follows. (Before, an error such as an invalid port showed only an
 * unhandled-rejection stack: deep dive CLI-16.)
 */
export async function main(argv: readonly string[]): Promise<void> {
  try {
    await run([...argv]);
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    if ((argv.includes("--verbose") || argv.includes("-V")) && error instanceof Error && error.stack) {
      print.muted(error.stack);
    }
    process.exitCode = 1;
  }
}

/**
 * True when Node runs this file itself (`node dist/cli.js`), and false when a module imports it.
 * The `mark` bin is `dist/bin.js`. `dist/cli.js` stays runnable for the documented commands
 * (`node packages/mark/dist/cli.js lib new <name>`).
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    const self = fileURLToPath(import.meta.url);
    const target = realpathSync(entry);
    return process.platform === "win32" ? self.toLowerCase() === target.toLowerCase() : self === target;
  } catch {
    return false;
  }
}

// Importing @mark1russell7/cli does not run the CLI (deep dive CLI-17)
if (isEntryPoint()) {
  await main(process.argv.slice(2));
}

export { run };
