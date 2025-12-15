#!/usr/bin/env node
/**
 * Mark CLI - Development workflow automation
 *
 * A declarative CLI that dispatches to client procedures.
 *
 * Usage:
 *   mark lib refresh [path] [-r|--recursive] [-y|--yes]
 *   mark lib scan [rootPath]
 *
 * @example
 * ```bash
 * # Refresh current directory
 * mark lib refresh
 *
 * # Refresh a specific package
 * mark lib refresh ~/git/logger
 *
 * # Recursive refresh (bottom-up DAG)
 * mark lib refresh ~/git/splay --recursive
 *
 * # Non-interactive mode
 * mark lib refresh . -r -y
 *
 * # Scan for packages
 * mark lib scan
 * ```
 */

import { buildCLI } from "./parser.js";
import { cliSpec } from "./spec.js";

// Build and run the CLI
const program = buildCLI(cliSpec);
program.parse();
