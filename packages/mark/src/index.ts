/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures from client packages.
 */

export { run } from "./cli.js";
export { reflectProcedure, reflectAllProcedures } from "./reflect.js";
export { parseFromSchema, generateHelp, type CLIMeta } from "./parse.js";
export { formatOutput, type OutputFormat } from "./format.js";
