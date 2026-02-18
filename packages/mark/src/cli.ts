#!/usr/bin/env node
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * Uses custom procedure-based routing with modern terminal utilities.
 */

import { print } from "./print.js";
import type {
  LocalTransport,
  Method,
  Message,
  ProcedureContext,
  ProcedurePath,
  AnyProcedure,
  ProcedureRegistry,
} from "@mark1russell7/client";
import { parseFromSchema, generateHelp, type CLIMeta } from "./parse.js";
import { formatOutput, type Print } from "./format.js";
import { loadEcosystemProcedures } from "./ecosystem.js";
import { startServerMode, extractPort, extractHost } from "./server-mode.js";
import { tryClientMode } from "./client-mode.js";
import { startRepl } from "./repl.js";

const VERSION = "1.0.0";

/**
 * Convert procedure path to transport method
 */
function pathToMethod(path: string[]): Method {
  const [service, ...rest] = path;
  return { service: service!, operation: rest.join(".") };
}

/**
 * Register procedure handlers on the transport
 */
function syncRegistryToTransport(
  transport: LocalTransport,
  registry: ProcedureRegistry
): void {
  // Helper to execute a procedure by path (for ctx.client.call)
  async function execProcedure<TOutput>(path: ProcedurePath, input: unknown): Promise<TOutput> {
    const proc = registry.get(path);
    if (!proc || !proc.handler) {
      throw new Error(`Procedure not found: ${path.join(".")}`);
    }
    const ctx = createContext(path);
    return proc.handler(input, ctx) as Promise<TOutput>;
  }

  // Helper to create ProcedureContext with client.call support
  function createContext(path: ProcedurePath): ProcedureContext {
    return {
      metadata: {},
      path,
      client: {
        call: <TInput, TOutput>(p: ProcedurePath, i: TInput) => execProcedure<TOutput>(p, i),
      },
    };
  }

  for (const procedure of registry.getAll()) {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          ...createContext(procedure.path),
          metadata: message.metadata ?? {},
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  }

  registry.on("register", (procedure: AnyProcedure) => {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          ...createContext(procedure.path),
          metadata: message.metadata ?? {},
          ...(message.signal ? { signal: message.signal } : {}),
        };
        return procedure.handler!(payload, context);
      });
    }
  });
}

/**
 * Parse command line arguments with procedure-aware path detection
 */
function parseArgs(
  argv: string[],
  procedures: AnyProcedure[]
): { path: string[]; args: string[]; options: Record<string, unknown> } {
  const path: string[] = [];
  const args: string[] = [];
  const options: Record<string, unknown> = {};

  let i = 0;

  // Collect path segments, stopping when we find a matching procedure
  while (i < argv.length) {
    const current = argv[i];
    if (current === undefined || current.startsWith("-")) break;

    // Check if adding this segment would still match a procedure or be a prefix
    const testPath = [...path, current];
    const exactMatch = findProcedure(procedures, testPath);
    const hasChildren = findChildren(procedures, testPath).length > 0;

    if (exactMatch) {
      // Found a procedure - add this segment and stop collecting path
      path.push(current);
      i++;
      break;
    } else if (hasChildren) {
      // This is a valid prefix (e.g., "procedure" has children like "procedure.get")
      path.push(current);
      i++;
    } else if (path.length === 0) {
      // First segment must be part of a valid path
      path.push(current);
      i++;
    } else {
      // No match and no children - this must be a positional arg
      break;
    }
  }

  // Remaining non-option args are positional arguments
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) {
      i++;
      continue;
    }

    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        options[key] = value;
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        // Take the next value if it exists and doesn't look like another flag
        if (next !== undefined && !next.startsWith("-")) {
          options[key] = next;
          i++;
        } else {
          options[key] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      args.push(arg);
    }
    i++;
  }

  return { path, args, options };
}

/**
 * Find a procedure matching the given path
 */
function findProcedure(procedures: AnyProcedure[], path: string[]): AnyProcedure | undefined {
  return procedures.find((p) => {
    if (p.path.length !== path.length) return false;
    return p.path.every((seg, i) => seg === path[i]);
  });
}

/**
 * Find procedures that are children of the given path
 */
function findChildren(procedures: AnyProcedure[], path: string[]): AnyProcedure[] {
  return procedures.filter((p) => {
    if (p.path.length <= path.length) return false;
    return path.every((seg, i) => seg === p.path[i]);
  });
}

/**
 * Show help for a path (either a command or a group)
 */
function showHelp(procedures: AnyProcedure[], path: string[]): void {
  const proc = findProcedure(procedures, path);

  if (proc) {
    // Show help for specific command with schema introspection
    const meta = (proc.metadata ?? {}) as CLIMeta;
    print.info(generateHelp(path, meta, proc.input));
    return;
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
    return;
  }

  // Unknown command
  print.error(`Unknown command: mark ${path.join(" ")}`);
  print.info("Run 'mark --help' for available commands.");
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

  const transport = new LocalTransport();
  syncRegistryToTransport(transport, PROCEDURE_REGISTRY);
  const client = new Client({ transport });

  const procedures = PROCEDURE_REGISTRY.getAll();

  return { client, procedures, verbose };
}

/**
 * Execute a single command given argv tokens.
 * Reusable by both CLI entry point and REPL.
 */
export async function executeArgs(argv: string[], ctx: CliContext): Promise<void> {
  const { client, procedures } = ctx;

  // Parse arguments (needs procedures for path detection)
  const { path, args, options } = parseArgs(argv, procedures);

  // Try client mode: connect to running server if available (unless --local)
  if (!argv.includes("--local") && path.length > 0 && !options["help"] && !options["h"]) {
    const clientResult = await tryClientMode(path, args, options, procedures);
    if (clientResult !== null) {
      if (clientResult.success) {
        const meta = (findProcedure(procedures, path)?.metadata ?? {}) as CLIMeta;
        const formatOverride = options["format"] as string | undefined;
        const outputFormat = (formatOverride ?? meta.output ?? "text") as "text" | "json" | "table" | "streaming";
        formatOutput(print as unknown as Print, clientResult.result, outputFormat);
        return;
      }
    }
  }

  // Handle --json flag for raw procedure reference execution
  const jsonInput = options["json"] as string | undefined;
  if (jsonInput && typeof jsonInput === "string") {
    try {
      const parsed = JSON.parse(jsonInput);
      if (parsed && typeof parsed === "object" && "$proc" in parsed) {
        const result = await client.exec(parsed);
        formatOutput(print as unknown as Print, result, "json");
        return;
      }
    } catch (e) {
      print.error(`Failed to parse --json input: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
      return;
    }
  }

  // Handle root help
  if (path.length === 0) {
    showRootHelp(procedures);
    return;
  }

  // Handle help for specific path
  if (options["help"] || options["h"]) {
    showHelp(procedures, path);
    return;
  }

  // Find matching procedure
  const proc = findProcedure(procedures, path);

  if (!proc) {
    const children = findChildren(procedures, path);
    if (children.length > 0) {
      showHelp(procedures, path);
    } else {
      print.error(`Unknown command: mark ${path.join(" ")}`);
      print.info("Run 'mark --help' for available commands.");
    }
    return;
  }

  // Execute the procedure
  const meta = (proc.metadata ?? {}) as CLIMeta;

  const formatOverride = options["format"] as string | undefined;
  const validFormats = ["text", "json", "table", "streaming"];
  if (formatOverride && !validFormats.includes(formatOverride)) {
    print.error(`Invalid format: ${formatOverride}. Valid formats: ${validFormats.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  delete options["format"];
  delete options["f"];

  const parameters = { array: args, options };

  try {
    const input = parseFromSchema(parameters, meta);
    const outputFormat = (formatOverride ?? meta.output ?? "text") as "text" | "json" | "table" | "streaming";
    let spinner: ReturnType<typeof print.spin> | undefined;

    if (outputFormat === "streaming") {
      spinner = print.spin(`Running ${path.join(" ")}...`);
    }

    let validated = input;
    if (proc.input) {
      validated = proc.input.parse(input) as Record<string, unknown>;
    }

    const method = pathToMethod(path);
    const result = await client.call(method, validated);

    if (spinner) {
      spinner.succeed(`${path.join(" ")} complete`);
    }

    formatOutput(print as unknown as Print, result, outputFormat);
  } catch (error) {
    print.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

/**
 * Run the CLI
 */
async function run(argv: string[]): Promise<void> {
  // Handle --version early (no imports needed)
  if (argv.includes("--version") || argv.includes("-v")) {
    print.info(`mark v${VERSION}`);
    return;
  }

  const verbose = argv.includes("--verbose") || argv.includes("-V");

  // Handle --server flag: start server mode
  if (argv.includes("--server")) {
    const port = extractPort(argv) ?? 3000;
    const host = extractHost(argv) ?? "0.0.0.0";
    await startServerMode({ port, host, verbose });
    return;
  }

  // Handle -i / --interactive flag: start REPL
  if (argv.includes("-i") || argv.includes("--interactive")) {
    await startRepl({ verbose });
    return;
  }

  // Normal CLI: init once, execute once
  const ctx = await initCli(verbose);
  await executeArgs(argv, ctx);
}

// Entry point
run(process.argv.slice(2));

export { run };
