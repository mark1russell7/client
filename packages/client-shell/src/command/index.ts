/**
 * `@mark1russell7/client-shell/command`: the helpers that start programs (roadmap 2.2).
 *
 * Each wrapper package starts its program through these helpers:
 * - an argument list, never a shell string;
 * - `ctx.signal` and a timeout kill the whole process tree;
 * - each output stream has a limit;
 * - a long-running process has a record in `processes`, and ends with the host.
 *
 * This entry point has no side effects: unlike the package root, it registers no procedures.
 */

export { runCommand, type CommandOptions, type CommandResult } from "./run.js";
export { streamCommand, type StreamCommandOptions, type CommandStreamItem } from "./stream.js";
export {
  ProcessRegistry,
  processes,
  type ManagedProcessInfo,
  type StartProcessOptions,
  type StopResult,
} from "./processes.js";
export { killTree } from "./tree-kill.js";
export type { SpawnOptions } from "./spawn.js";
export { DEFAULT_MAX_OUTPUT_BYTES } from "./output.js";
