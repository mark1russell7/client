/**
 * Declarative CLI Specification
 *
 * Maps CLI commands to client procedures.
 * This is the single source of truth for CLI structure.
 */

import { z } from "zod";
import type { CLISpec, ParsedArgs } from "./types.js";

/**
 * The CLI specification
 */
export const cliSpec: CLISpec = {
  name: "mark",
  version: "1.0.0",
  description: "Mark CLI - Development workflow automation",

  commands: [
    // ==========================================================================
    // lib refresh
    // ==========================================================================
    {
      path: ["lib", "refresh"],
      description:
        "Refresh a library (clean node_modules/dist, npm install, build, commit/push)",
      procedure: ["lib", "refresh"],
      args: [
        {
          name: "path",
          type: "string",
          description: "Path to the library (default: current directory)",
          required: false,
          position: 0,
          default: ".",
        },
      ],
      options: [
        {
          name: "recursive",
          short: "r",
          type: "boolean",
          description: "Recursively refresh dependencies (bottom-up DAG)",
          default: false,
        },
        {
          name: "yes",
          short: "y",
          type: "boolean",
          description: "Non-interactive mode (auto-confirm on errors)",
          default: false,
        },
      ],
      inputSchema: z.object({
        path: z.string(),
        recursive: z.boolean(),
        autoConfirm: z.boolean(),
        sessionId: z.string().optional(),
      }),
      transform: (parsed: ParsedArgs) => ({
        path: parsed.args["path"] ?? ".",
        recursive: parsed.options["recursive"] ?? false,
        autoConfirm: parsed.options["yes"] ?? false,
      }),
    },

    // ==========================================================================
    // lib scan
    // ==========================================================================
    {
      path: ["lib", "scan"],
      description: "Scan ~/git for packages and show package-to-repo mapping",
      procedure: ["lib", "scan"],
      args: [
        {
          name: "rootPath",
          type: "string",
          description: "Root path to scan (default: ~/git)",
          required: false,
          position: 0,
        },
      ],
      options: [],
      inputSchema: z.object({
        rootPath: z.string().optional(),
      }),
      transform: (parsed: ParsedArgs) => ({
        rootPath: parsed.args["rootPath"],
      }),
    },

    // ==========================================================================
    // lib rename
    // ==========================================================================
    {
      path: ["lib", "rename"],
      description: "Rename a package across the codebase (updates imports and dependencies)",
      procedure: ["lib", "rename"],
      args: [
        {
          name: "oldName",
          type: "string",
          description: "Current package name",
          required: true,
          position: 0,
        },
        {
          name: "newName",
          type: "string",
          description: "New package name",
          required: true,
          position: 1,
        },
      ],
      options: [
        {
          name: "root",
          short: "r",
          type: "string",
          description: "Root path to scan (default: ~/git)",
          default: undefined,
        },
        {
          name: "dry-run",
          short: "d",
          type: "boolean",
          description: "Preview changes without applying",
          default: false,
        },
      ],
      inputSchema: z.object({
        oldName: z.string(),
        newName: z.string(),
        rootPath: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      transform: (parsed: ParsedArgs) => ({
        oldName: parsed.args["oldName"],
        newName: parsed.args["newName"],
        rootPath: parsed.options["root"],
        dryRun: parsed.options["dry-run"] ?? false,
      }),
    },
  ],
};
