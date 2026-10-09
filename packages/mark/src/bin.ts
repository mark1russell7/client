#!/usr/bin/env node
/**
 * The `mark` executable.
 *
 * Importing `@mark1russell7/cli` gives the functions and runs nothing (deep dive CLI-17).
 * This file runs the CLI. `node dist/cli.js` also runs it, for the documented commands.
 */

import { main } from "./cli.js";

await main(process.argv.slice(2));
