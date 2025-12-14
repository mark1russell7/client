#!/usr/bin/env node
/**
 * Client CLI
 *
 * Command-line interface for procedure discovery and library scaffolding.
 *
 * Commands:
 * - discover: Generate procedure imports (reads from registry or scans)
 * - announce: Register this package's procedures (called from postinstall)
 * - init: Initialize a new library with procedure support
 */

import { parseArgs } from "node:util";
import { discover } from "./discover.js";
import { init } from "./init.js";
import { announce, unannounce } from "./announce.js";

// =============================================================================
// CLI Parser
// =============================================================================

interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean | undefined>;
  positionals: string[];
}

function parseCliArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const rest = args.slice(1);

  // Parse based on command
  switch (command) {
    case "discover": {
      const { values } = parseArgs({
        args: rest,
        options: {
          output: { type: "string", short: "o", default: "./__generated__/procedures.ts" },
          root: { type: "string", short: "r", default: process.cwd() },
          watch: { type: "boolean", short: "w", default: false },
          check: { type: "boolean", short: "c", default: false },
          verbose: { type: "boolean", short: "v", default: false },
        },
        allowPositionals: false,
      });
      return { command, options: values, positionals: [] };
    }

    case "init": {
      const { values, positionals } = parseArgs({
        args: rest,
        options: {
          force: { type: "boolean", short: "f", default: false },
        },
        allowPositionals: true,
      });
      return { command, options: values, positionals };
    }

    case "announce": {
      const { values } = parseArgs({
        args: rest,
        options: {
          verbose: { type: "boolean", short: "v", default: false },
        },
        allowPositionals: false,
      });
      return { command, options: values, positionals: [] };
    }

    case "unannounce": {
      const { values } = parseArgs({
        args: rest,
        options: {
          verbose: { type: "boolean", short: "v", default: false },
        },
        allowPositionals: false,
      });
      return { command, options: values, positionals: [] };
    }

    case "help":
    case "--help":
    case "-h":
      return { command: "help", options: {}, positionals: [] };

    case "version":
    case "--version":
    case "-V":
      return { command: "version", options: {}, positionals: [] };

    default:
      console.error(`Unknown command: ${command}`);
      return { command: "help", options: {}, positionals: [] };
  }
}

// =============================================================================
// Help Text
// =============================================================================

function printHelp(): void {
  console.log(`
client - Procedure discovery and library scaffolding CLI

Usage:
  client <command> [options]

Commands:
  discover    Generate procedure imports (from registry or by scanning)
  announce    Register this package's procedures (used in postinstall)
  init        Initialize a new library with procedure support
  help        Show this help message
  version     Show version

Examples:
  # Generate procedure imports from dependencies
  client discover

  # Generate to custom output path
  client discover --output ./src/generated/procedures.ts

  # Watch for changes (dev mode)
  client discover --watch

  # Check if generated file is up-to-date (CI)
  client discover --check

  # Initialize a new library
  client init my-new-lib

  # Initialize in current directory
  client init .

  # Register procedures (called automatically via postinstall)
  client announce

How it works:
  1. Libraries with procedures add to package.json:
     { "client": { "procedures": "./dist/register.js" } }

  2. Libraries add postinstall hook:
     { "scripts": { "postinstall": "client announce" } }

  3. When installed, each library announces itself to .client-registry.json

  4. App runs "client discover" to generate imports from the registry

For more information, visit: https://github.com/your-org/client
`);
}

function printVersion(): void {
  // Read version from package.json at runtime
  console.log("client v1.0.0");
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const { command, options, positionals } = parseCliArgs();

  try {
    switch (command) {
      case "discover":
        await discover({
          output: options.output as string,
          root: options.root as string,
          watch: options.watch as boolean,
          check: options.check as boolean,
          verbose: options.verbose as boolean,
        });
        break;

      case "init": {
        const name = positionals[0];
        if (!name) {
          console.error("Error: Please provide a library name");
          console.error("Usage: client init <name>");
          process.exit(1);
        }
        await init({
          name,
          force: options.force as boolean,
        });
        break;
      }

      case "announce":
        await announce({
          verbose: options.verbose as boolean,
        });
        break;

      case "unannounce":
        await unannounce({
          verbose: options.verbose as boolean,
        });
        break;

      case "help":
        printHelp();
        break;

      case "version":
        printVersion();
        break;
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
