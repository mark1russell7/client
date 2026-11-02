#!/usr/bin/env node
/**
 * The `mark` executable.
 *
 * Importing `@procedures/mark` gives the functions and runs nothing (deep dive CLI-17).
 * This file runs the CLI. `node dist/cli.js` also runs it, for the documented commands.
 *
 * The bin owns its process: the runner of each command owns the signals, and it ends the process
 * with the exit code of the command (CLI-26).
 *
 * This file enables the compile cache first (roadmap O90). Node.js loads each static import before
 * the first statement, so the CLI loads with a dynamic import after the cache starts.
 */

import { enableCompileCache } from "./compile-cache.js";

enableCompileCache();

const { main } = await import("./cli.js");
await main(process.argv.slice(2), { ownsProcess: true });
