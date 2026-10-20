#!/usr/bin/env node
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * Uses custom procedure-based routing with modern terminal utilities.
 */

import { print } from "./print.js";
import type { Method, AnyProcedure } from "@procedures/client";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fieldsOf, generateHelp, resultFieldsOf, type CLIMeta, type CommandLike } from "./parse.js";
import { readFreshManifest, writeManifest, type ManifestCommand } from "./manifest.js";
import { askMissing, canAsk, missingFields, processTerminal, terminalAsker, type Asker, type Terminal } from "./ask.js";
import { formatOutput, type OutputFormat, type Print } from "./format.js";
import { loadEcosystemRegistry } from "./ecosystem.js";
import { startServerMode, parsePort, parseTransport } from "./server-mode.js";
import { tryClientMode } from "./client-mode.js";
import { startRepl } from "./repl.js";
import { findChildren, findProcedure, parseCommandLine, parseLeadingGlobals } from "./args.js";
import { failureOf } from "./failure.js";

/** The version of this package. This file is `dist/cli.js` (or `src/cli.ts` in the tests): the package.json is one folder up. */
const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

/**
 * Convert procedure path to transport method. The core mapping is the one of every host: the
 * last segment is the operation (deep dive architecture review 3.3). The core loads only for a
 * run in this process: the help and a call to the CLI server do not need it.
 */
async function pathToMethod(path: string[]): Promise<Method> {
  const { pathToMethod: corePathToMethod } = await import("@procedures/client");
  return corePathToMethod(path);
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
function showHelp(procedures: readonly CommandLike[], path: string[]): boolean {
  const proc = findProcedure(procedures, path);

  if (proc) {
    // Show help for specific command with schema introspection (or the fields of the manifest)
    const meta = (proc.metadata ?? {}) as CLIMeta;
    print.info(generateHelp(path, meta, fieldsOf(proc), resultFieldsOf(proc)));
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
function showRootHelp(procedures: readonly CommandLike[]): void {
  print.info(`mark v${VERSION} - Development workflow automation\n`);
  print.info("Commands:\n");

  // Group by first path segment
  const groups = new Map<string, CommandLike[]>();
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
  print.info("Hosts: 'mark serve [--procedures pkgs] [--port N] [--expose patterns] [--events topics]' (the procedure server),");
  print.info("       'mark mcp' (the dev-tools MCP server over stdio).");
  print.info("Modes: 'mark --server [--port N] [--host H] [--transport http|websocket|both] [--events topics] [--probe-port N]' and 'mark -i' (the REPL).");
  print.info("Root:  'mark --fs-root <folder> <command>' keeps each path of each procedure in the folder, also in each mode and host.");
  print.info("       It refuses the procedures that it cannot confine: git, pnpm, docker run, a program (FORBIDDEN, outside-root).");
}

/** The global flags that only `--server` takes. */
const SERVER_OPTIONS = ["port", "host", "transport", "events", "probe-port"] as const;

/** True when the global flags give an option of `--server`. */
function hasServerOption(globals: Readonly<Record<string, unknown>>): boolean {
  return SERVER_OPTIONS.some((name) => globals[name] !== undefined);
}

/** The topic patterns of `--events`, checked as `mark serve` checks them. */
async function eventPatterns(value: string | boolean | undefined): Promise<string[]> {
  if (value === undefined) return [];
  const { parseTopicPatterns } = await import("@procedures/server");
  return parseTopicPatterns(String(value));
}

/**
 * CLI execution context, created once and reused
 */
export interface CliContext {
  client: InstanceType<typeof import("@procedures/client").Client>;
  procedures: AnyProcedure[];
  verbose: boolean;
  /** The absolute path of the root of the `fs.*` procedures (`--fs-root`), or undefined. */
  fsRoot?: string | undefined;
}

/**
 * The context of a run that starts from the manifest: the commands are known, the procedures
 * are not loaded. `load()` loads them when the command runs in this process.
 */
export interface ManifestContext {
  commands: readonly ManifestCommand[];
  verbose: boolean;
  /** The absolute path of the root that `load()` gives to the `fs.*` procedures, or undefined. */
  fsRoot?: string | undefined;
  load: () => Promise<CliContext>;
}

/** The terminal and the asker of the questions for missing arguments (tests give fakes) */
export interface ExecuteOptions {
  terminal?: Terminal;
  ask?: Asker;
}

/**
 * A signal that aborts on the first Ctrl+C while a command runs in this process (roadmap R14):
 * the procedure gets the abort (a shell command stops its process tree). A second Ctrl+C exits
 * at once. `release()` removes the listener when the command ends.
 */
function interruptSignal(): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController();
  const onInterrupt = (): void => {
    if (controller.signal.aborted) process.exit(130);
    controller.abort();
  };
  process.on("SIGINT", onInterrupt);
  return { signal: controller.signal, release: () => process.off("SIGINT", onInterrupt) };
}

/**
 * Initialize the CLI context (load ecosystem, create client)
 * This is the expensive part (~4s). Call once, reuse many times. With `fsRoot` (`--fs-root`),
 * each procedure keeps its paths in the root, also in the nested calls, or the root refuses it.
 */
export async function initCli(verbose = false, fsRoot?: string): Promise<CliContext> {
  const clientModule = await import("@procedures/client");
  const { Client, LocalTransport } = clientModule;

  // A registry of its own, from the module of each package (roadmap 3.1): not the global one
  const ecosystem = await loadEcosystemRegistry(verbose, true, { fsRoot });
  const { registry } = ecosystem;

  // The transport runs each procedure of the registry through invokeProcedure() (ARCHITECTURE-PROPOSALS P1).
  // useRegistry(): exec() of a program (--json) uses the same registry.
  const transport = new LocalTransport({ registry });
  const client = new Client({ transport }).useRegistry(registry);

  const procedures = registry.getAll();

  return { client, procedures, verbose, ...(ecosystem.fsRoot !== undefined ? { fsRoot: ecosystem.fsRoot } : {}) };
}

/**
 * Execute a single command given argv tokens.
 * Reusable by both CLI entry point and REPL.
 *
 * The exit code is 1 for an unknown command, a problem of the command line, invalid input, a
 * thrown error, and a result that reports a failure (`success: false`, or an `exitCode` that is
 * not 0: see failure.ts). Before, all of these exited with 0 (deep dive CLI-8).
 *
 * With a ManifestContext, the help and a call to the CLI server need no procedures: they load
 * only when the command runs in this process (roadmap 1.3).
 */
export async function executeArgs(
  argv: string[],
  ctx: CliContext | ManifestContext,
  options: ExecuteOptions = {}
): Promise<void> {
  const procedures: readonly CommandLike[] = "procedures" in ctx ? ctx.procedures : ctx.commands;
  let loaded: CliContext | undefined = "procedures" in ctx ? ctx : undefined;
  const local = async (): Promise<CliContext> => (loaded ??= await (ctx as ManifestContext).load());

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
  if (hasServerOption(globals)) {
    fail("--port, --host, --transport, --events and --probe-port are options of --server.");
    return;
  }
  // The root applies to the whole run: the procedures load with it, and a warm server must have it
  if (globals["fs-root"] !== undefined && resolve(String(globals["fs-root"])) !== ctx.fsRoot) {
    fail(
      `--fs-root ${String(globals["fs-root"])} does not apply here: give it before the command (mark --fs-root <folder> <command>).`,
      ctx.fsRoot === undefined ? undefined : `This run has the root ${ctx.fsRoot}.`
    );
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
    const interrupt = interruptSignal();
    try {
      const { client } = await local();
      const result = await client.exec(parsedJson as Parameters<typeof client.exec>[0], undefined, { signal: interrupt.signal });
      formatOutput(print as unknown as Print, result, "json");
      if (failureOf(result)) {
        process.exitCode = 1;
      }
    } catch (error) {
      fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      interrupt.release();
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

  // A required argument that is missing: in a terminal, mark asks for it (see ask.ts)
  let input = parsed.input;
  const missing = missingFields(fieldsOf(procedure), input);
  if (missing.length > 0 && canAsk(globals["no-input"] === true, meta, options.terminal ?? processTerminal())) {
    const asked = await askMissing(missing, input, options.ask ?? terminalAsker);
    if (!asked.ok) {
      fail(asked.cancelled ? "Cancelled" : `Invalid input for mark ${path.join(" ")}:\n  ${asked.error}`);
      return;
    }
    input = asked.input;
  }

  // A procedure of the registry validates the input here. A command of the manifest has no
  // schema: the CLI server validates, or this process after the procedures load.
  let validated: unknown = input;
  let checked = false;
  const validate = (target: CommandLike): boolean => {
    const schema = target.input as { parse?: (data: unknown) => unknown } | undefined;
    try {
      if (typeof schema?.parse === "function") {
        validated = schema.parse(input);
      }
    } catch (error) {
      fail(`Invalid input for mark ${path.join(" ")}:\n  ${validationMessage(error)}`, `Run 'mark ${path.join(" ")} --help' for the options.`);
      return false;
    }
    checked = true;
    return true;
  };
  if (loaded) {
    if (!validate(procedure)) {
      return;
    }
  } else {
    const stillMissing = missingFields(fieldsOf(procedure), input);
    if (stillMissing.length > 0) {
      const names = stillMissing.map((field) => `${field.name}: Required`).join("\n  ");
      fail(`Invalid input for mark ${path.join(" ")}:\n  ${names}`, `Run 'mark ${path.join(" ")} --help' for the options.`);
      return;
    }
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
    const clientResult = await tryClientMode(path, validated, printItem, ctx.fsRoot);
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

  // The command runs in this process: the procedures load now (a ManifestContext)
  let runtime: CliContext;
  try {
    runtime = await local();
  } catch (error) {
    fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const target = findProcedure(runtime.procedures, path);
  if (!target) {
    fail(`Unknown command: mark ${path.join(" ")}`, "Run 'mark --help' for available commands.");
    return;
  }
  if (!checked && !validate(target)) {
    return;
  }

  try {
    let spinner: ReturnType<typeof print.spin> | undefined;

    if (outputFormat === "streaming") {
      spinner = print.spin(`Running ${path.join(" ")}...`);
    }

    const method = await pathToMethod(path);
    const { client } = runtime;

    // A streaming procedure gives many items: print each one when it arrives. A
    // request/response procedure gives one item, so its output does not change.
    let items = 0;
    const interrupt = interruptSignal();
    try {
      for await (const item of client.stream(method, validated, { signal: interrupt.signal })) {
        if (spinner && items === 0) spinner.stop();
        items++;
        printItem(item);
      }
    } finally {
      interrupt.release();
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

const MCP_HELP = `Usage: mark mcp [options]

Start the dev-tools MCP server over stdio (the server of Claude Code's MCP configuration), or
over Streamable HTTP with --http.
It has a registry of its own, from the modules of its bundles, and the host policy of an MCP
server: only the tools of the bundles, strict nested calls, and a time limit for each call.

Options:
  --bundles <list>      Comma-separated bundles (default: MCP_BUNDLES, or @procedures/bundle-mcp)
  --tool-timeout <ms>   The time limit of each tool call (default: MCP_TOOL_TIMEOUT_MS, or 600000)
  --read-only           Only the tools that change nothing (default: MCP_READ_ONLY)
  --http <port>         Serve over Streamable HTTP on this port, not over stdio (MCP_HTTP_PORT)
  --host <host>         The address of --http (default: 127.0.0.1, only this computer)
  --token <token>       A secret that each HTTP request must send as a bearer token
  --max-sessions <n>    The most sessions of --http at one time (default: MCP_HTTP_MAX_SESSIONS,
                        or 256). Infinity turns the limit off.
  --fs-root <folder>    Keep each path of each tool in this folder, also in the nested calls,
                        and refuse each tool that the folder cannot confine (default:
                        MCP_FS_ROOT, or no root). The list of the tools stays the same.
  --debug               Write debug lines to stderr
  -h, --help            Show this help

The MCP server serves no remote events: MCP carries only the tool calls.
\`mark mcp <procedure>\` runs an mcp.* procedure instead (mark mcp serve, mark mcp listTools).`;

/**
 * Start the dev-tools MCP server (`mark mcp`). stdout carries the protocol: this function
 * writes nothing to stdout, and the server sends console.log to stderr.
 */
async function startMcp(args: string[], fsRoot?: string): Promise<void> {
  const { loadConfig, runDevToolsServer } = await import("@procedures/mcp-dev-tools");
  const config = loadConfig();
  // `mark --fs-root <folder> mcp` replaces MCP_FS_ROOT, and `mark mcp --fs-root` replaces both
  if (fsRoot !== undefined) config.fsRoot = fsRoot;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const value = (): string => {
      if (eq !== -1) return arg.slice(eq + 1);
      const next = args[++i];
      if (next === undefined) throw new Error(`${name} needs a value`);
      return next;
    };
    if (name === "-h" || name === "--help") {
      process.stderr.write(`${MCP_HELP}\n`);
      return;
    } else if (name === "--bundles") {
      config.bundles = value().split(",").map((bundle) => bundle.trim()).filter(Boolean);
    } else if (name === "--tool-timeout") {
      const ms = Number(value());
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`--tool-timeout needs a number of milliseconds`);
      config.toolTimeoutMs = ms;
    } else if (name === "--read-only") {
      config.readOnly = true;
    } else if (name === "--http") {
      const port = Number(value());
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--http needs a port number");
      config.http = { ...config.http, port };
    } else if (name === "--host") {
      config.http = { port: config.http?.port ?? 3003, ...config.http, host: value() };
    } else if (name === "--token") {
      config.http = { port: config.http?.port ?? 3003, ...config.http, token: value() };
    } else if (name === "--max-sessions") {
      // The session limit of the HTTP face (CLI-51): an integer of 1 or more, or Infinity
      const maxSessions = Number(value());
      if (maxSessions !== Number.POSITIVE_INFINITY && (!Number.isInteger(maxSessions) || maxSessions < 1)) {
        throw new Error("--max-sessions needs an integer of 1 or more, or Infinity");
      }
      config.http = { port: config.http?.port ?? 3003, ...config.http, maxSessions };
    } else if (name === "--fs-root") {
      config.fsRoot = value();
    } else if (name === "--debug") {
      config.debug = true;
    } else {
      throw new Error(`Unknown option of mark mcp: ${arg}. Run 'mark mcp --help'.`);
    }
  }
  // The server runs under run() of the service (CLI-11): the runner owns the signals, the stop
  // in stages and the exit. Over stdio, the end of the input stops it.
  await runDevToolsServer(config);
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

  // --fs-root (roadmap R33): the root of the fs.* procedures for each mode and host of this run
  const fsRoot = globals["fs-root"] === undefined ? undefined : resolve(String(globals["fs-root"]));

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
    const events = await eventPatterns(globals.events);
    // --probe-port: the probes answer on a port of their own (CLI-9, decision D5)
    const probePort = globals["probe-port"] === undefined ? undefined : parsePort(String(globals["probe-port"]));
    await startServerMode({
      port,
      host,
      transport,
      verbose,
      events,
      ...(probePort !== undefined ? { probePort } : {}),
      ...(fsRoot !== undefined ? { fsRoot } : {}),
    });
    return;
  }
  // Before, `mark --port 4000 serve` ignored --port without a word
  if (hasServerOption(globals)) {
    fail("--port, --host, --transport, --events and --probe-port are options of --server.", "For mark serve, give them after serve.");
    return;
  }

  // Handle -i / --interactive flag: start REPL
  if (globals.interactive) {
    if (leading.rest.length > 0) {
      fail(`-i takes no command: ${leading.rest.join(" ")}`);
      return;
    }
    await startRepl({ verbose, fsRoot });
    return;
  }

  // The front door (roadmap 2.3): `mark serve` starts the procedure server (the `server` CLI),
  // and `mark mcp` starts the dev-tools MCP server over stdio (the server of impl-mcp-dev).
  // `mark mcp <procedure>` still runs an mcp.* procedure (`mark mcp serve`, `mark mcp listTools`).
  const [command, ...commandArgs] = leading.rest;
  if (command === "serve") {
    const { runServer } = await import("@procedures/server");
    // A --procedures package resolves from the current folder, then from mark, which depends on
    // every procedure package of the workspace
    const markDir = dirname(dirname(fileURLToPath(import.meta.url)));
    // `mark --fs-root <folder> serve`: the root goes first, so a --fs-root after serve wins
    const serveArgs = fsRoot === undefined ? commandArgs : ["--fs-root", fsRoot, ...commandArgs];
    await runServer(serveArgs, { resolveFrom: [process.cwd(), markDir] });
    return;
  }
  // `mark mcp` and `mark mcp --option value`: the server. `mark mcp <procedure>`: an mcp.* command.
  if (command === "mcp" && (commandArgs.length === 0 || commandArgs[0]!.startsWith("-"))) {
    await startMcp(commandArgs, fsRoot);
    return;
  }

  // The manifest gives the commands without the procedures: the help and a call to the CLI
  // server do not load them (roadmap 1.3)
  const manifest = readFreshManifest();
  if (manifest) {
    await executeArgs(argv, { commands: manifest.commands, verbose, fsRoot, load: () => initCli(verbose, fsRoot) });
    return;
  }

  // No manifest, or a stale one (a package was built again): load the procedures as before, and
  // write the manifest for the next run. A failure to write costs only time.
  const ctx = await initCli(verbose, fsRoot);
  try {
    await writeManifest(ctx.procedures);
  } catch (error) {
    if (verbose) {
      print.warning(`mark: the manifest was not written: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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

// Importing @procedures/mark does not run the CLI (deep dive CLI-17)
if (isEntryPoint()) {
  await main(process.argv.slice(2));
}

export { run };
