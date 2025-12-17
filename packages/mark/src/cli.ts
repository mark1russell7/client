#!/usr/bin/env node
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * Uses our own routing with Gluegun's toolbox for utilities.
 */

import { print } from "gluegun";
import type {
  LocalTransport,
  Method,
  Message,
  ProcedureContext,
  AnyProcedure,
  ProcedureRegistry,
} from "@mark1russell7/client";
import { parseFromSchema, generateHelp, type CLIMeta } from "./parse";
import { formatOutput, type Print } from "./format";
import { loadEcosystemProcedures } from "./ecosystem";

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
  for (const procedure of registry.getAll()) {
    if (procedure.handler) {
      const method = pathToMethod(procedure.path);
      transport.register(method, async (payload: unknown, message: Message<unknown>) => {
        const context: ProcedureContext = {
          metadata: message.metadata ?? {},
          path: procedure.path,
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
          metadata: message.metadata ?? {},
          path: procedure.path,
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
        if (next !== undefined && !next.startsWith("-")) {
          if (next !== "true" && next !== "false" && !/^\d+$/.test(next)) {
            options[key] = next;
            i++;
          } else {
            options[key] = true;
          }
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
    // Show help for specific command
    const meta = (proc.metadata ?? {}) as CLIMeta;
    print.info(generateHelp(path, meta));
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
 * Run the CLI
 */
async function run(argv: string[]): Promise<void> {
  // Dynamic imports for ESM packages (CLI is CommonJS for Gluegun compatibility)
  const clientModule = await import("@mark1russell7/client");
  const { Client, LocalTransport, PROCEDURE_REGISTRY } = clientModule;

  // Load procedure packages (side-effect imports that register procedures)
  // Core client procedures are auto-registered when client is imported
  await import("@mark1russell7/client-cli");
  await import("@mark1russell7/client-logger");

  // Dynamic ecosystem discovery - load procedures from all ecosystem packages
  const verbose = argv.includes("--verbose") || argv.includes("-V");
  await loadEcosystemProcedures(verbose);

  // Create client with local transport
  const transport = new LocalTransport();
  syncRegistryToTransport(transport, PROCEDURE_REGISTRY);
  const client = new Client({ transport });

  // Get all registered procedures
  const procedures = PROCEDURE_REGISTRY.getAll();

  // Handle --version
  if (argv.includes("--version") || argv.includes("-v")) {
    print.info(`mark v${VERSION}`);
    return;
  }

  // Parse arguments (needs procedures for path detection)
  const { path, args, options } = parseArgs(argv, procedures);

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
    // Maybe it's a group?
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

  // Build parameters for parsing
  const parameters = {
    array: args,
    options,
  };

  try {
    // Parse input from CLI args
    const input = parseFromSchema(parameters, meta);

    // Show spinner for streaming output
    const outputFormat = meta.output ?? "text";
    let spinner: ReturnType<typeof print.spin> | undefined;

    if (outputFormat === "streaming") {
      spinner = print.spin(`Running ${path.join(" ")}...`);
    }

    // Validate and call
    let validated = input;
    if (proc.input) {
      validated = proc.input.parse(input) as Record<string, unknown>;
    }

    const method = pathToMethod(path);
    const result = await client.call(method, validated);

    // Stop spinner and format output
    if (spinner) {
      spinner.succeed(`${path.join(" ")} complete`);
    }

    formatOutput(print as unknown as Print, result, outputFormat as "text" | "json" | "table" | "streaming");
  } catch (error) {
    print.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

// Entry point
run(process.argv.slice(2));

export { run };
