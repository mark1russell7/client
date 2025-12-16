/**
 * Procedure Reflection
 *
 * Reflects procedures from the registry into Gluegun commands.
 * This is the core of the generic CLI - procedures define themselves,
 * and the CLI just reflects them.
 */

import type { GluegunToolbox } from "gluegun";
import type { Client } from "@mark1russell7/client";
import type { AnyProcedure, ProcedurePath } from "@mark1russell7/client";
import { parseFromSchema, generateHelp, type CLIMeta } from "./parse.js";
import { formatOutput, type OutputFormat, type Print } from "./format.js";

/**
 * Gluegun command shape
 */
export interface GluegunCommand {
  name: string;
  commandPath: string[];
  description?: string;
  hidden?: boolean;
  run: (toolbox: GluegunToolbox) => Promise<void>;
}

/**
 * Build the method object for client.call
 */
function pathToMethod(path: ProcedurePath): { service: string; operation: string } {
  const [service, ...rest] = path;
  return {
    service: service!,
    operation: rest.join("."),
  };
}

/**
 * Reflect a procedure into a Gluegun command
 */
export function reflectProcedure(
  proc: AnyProcedure,
  client: Client
): GluegunCommand {
  const meta = (proc.meta ?? {}) as CLIMeta;
  const schema = proc.inputSchema;
  const path = proc.path;

  return {
    name: path[path.length - 1] ?? "unknown",
    commandPath: [...path],
    description: meta.description ?? `Call ${path.join(".")}`,
    run: async (toolbox: GluegunToolbox) => {
      const { parameters, print } = toolbox;

      // Check for --help flag
      if (parameters.options?.["help"] || parameters.options?.["h"]) {
        if (schema) {
          print.info(generateHelp(path, schema, meta));
        } else {
          print.info(`Usage: mark ${path.join(" ")} [options]`);
          if (meta.description) {
            print.info(`\n${meta.description}`);
          }
        }
        return;
      }

      try {
        // 1. Parse input from CLI args
        let input: Record<string, unknown> = {};
        if (schema) {
          input = parseFromSchema(parameters, schema, meta);
        } else if (parameters.first) {
          // No schema - try JSON input
          try {
            input = JSON.parse(parameters.first) as Record<string, unknown>;
          } catch {
            input = { input: parameters.first };
          }
        }

        // 2. Show spinner for streaming output
        const outputFormat = meta.output ?? "text";
        let spinner: ReturnType<Print["spin"]> | undefined;

        if (outputFormat === "streaming") {
          spinner = print.spin(`Running ${path.join(" ")}...`);
        }

        // 3. Validate with Zod if schema exists
        let validated = input;
        if (schema) {
          validated = schema.parse(input) as Record<string, unknown>;
        }

        // 4. Call the procedure
        const method = pathToMethod(path);
        const result = await client.call(method, validated);

        // 5. Stop spinner and format output
        if (spinner) {
          spinner.succeed(`${path.join(" ")} complete`);
        }

        formatOutput(print as Print, result, outputFormat as OutputFormat);
      } catch (error) {
        print.error(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exitCode = 1;
      }
    },
  };
}

/**
 * Create parent commands for nested paths
 *
 * For a command at ["lib", "refresh"], we need a parent ["lib"] command
 * that shows help for all lib subcommands.
 */
export function createParentCommands(
  procedures: AnyProcedure[]
): GluegunCommand[] {
  // Find all unique parent paths
  const parentPaths = new Map<string, string[]>();

  for (const proc of procedures) {
    const path = proc.path;
    // Create parent for each level except the leaf
    for (let i = 1; i < path.length; i++) {
      const parentPath = path.slice(0, i);
      const key = parentPath.join(".");
      if (!parentPaths.has(key)) {
        parentPaths.set(key, parentPath);
      }
    }
  }

  // Create parent commands
  const parents: GluegunCommand[] = [];

  for (const [, parentPath] of parentPaths) {
    // Find all direct children
    const children = procedures.filter((p) => {
      if (p.path.length !== parentPath.length + 1) return false;
      return parentPath.every((seg, i) => p.path[i] === seg);
    });

    // Find all descendant parent paths (nested groups)
    const childGroups = [...parentPaths.values()].filter((p) => {
      if (p.length !== parentPath.length + 1) return false;
      return parentPath.every((seg, i) => p[i] === seg);
    });

    parents.push({
      name: parentPath[parentPath.length - 1] ?? "unknown",
      commandPath: [...parentPath],
      description: `${parentPath[parentPath.length - 1]} commands`,
      run: async (toolbox) => {
        const { print } = toolbox;
        const parentName = parentPath.join(" ");

        print.info(`${parentName} commands:\n`);

        // List child commands
        for (const child of children) {
          const meta = (child.meta ?? {}) as CLIMeta;
          const childName = child.path[child.path.length - 1];
          const desc = meta.description ?? "";
          print.info(`  mark ${parentName} ${childName}  ${desc}`);
        }

        // List child groups
        for (const group of childGroups) {
          const groupName = group[group.length - 1];
          print.info(`  mark ${parentName} ${groupName}  ${groupName} commands`);
        }

        print.info(`\nRun 'mark ${parentName} <command> --help' for details.`);
      },
    });
  }

  return parents;
}

/**
 * Reflect all procedures into Gluegun commands
 */
export function reflectAllProcedures(
  procedures: AnyProcedure[],
  client: Client
): GluegunCommand[] {
  const commands: GluegunCommand[] = [];

  // Create parent commands first
  commands.push(...createParentCommands(procedures));

  // Create leaf commands
  for (const proc of procedures) {
    commands.push(reflectProcedure(proc, client));
  }

  return commands;
}
