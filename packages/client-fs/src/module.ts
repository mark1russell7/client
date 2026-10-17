/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for filesystem operations
 *
 * Registers fs.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 *
 * `fsModule` operates on each path. `createFsModule({ root })` gives the same procedures, and
 * each path of their input must be in the root (roadmap R33, `root.ts`). `confineToRoot()` gives
 * a root to all the procedures of a registry (`confine.ts`).
 */

import { createProcedure, zodAdapter, defineModule, type AnyProcedure, type Effects, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { HANDLER_NAMES, rootedHandlers } from "./handlers.js";
import { confineOtherProcedures, rootDecisionOf, type ConfinedRegistry } from "./confine.js";
import { read } from "./procedures/fs/read.js";
import { write } from "./procedures/fs/write.js";
import { exists } from "./procedures/fs/exists.js";
import { mkdir } from "./procedures/fs/mkdir.js";
import { rm } from "./procedures/fs/rm.js";
import { readdir } from "./procedures/fs/readdir.js";
import { stat } from "./procedures/fs/stat.js";
import { copy } from "./procedures/fs/copy.js";
import { move } from "./procedures/fs/move.js";
import { glob } from "./procedures/fs/glob.js";
import { readJson } from "./procedures/fs/json.js";
import {
  ReadInputSchema,
  WriteInputSchema,
  ExistsInputSchema,
  MkdirInputSchema,
  RmInputSchema,
  ReaddirInputSchema,
  StatInputSchema,
  CopyInputSchema,
  MoveInputSchema,
  GlobInputSchema,
  ReadJsonInputSchema,
  type ReadInput,
  type ReadOutput,
  type WriteInput,
  type WriteOutput,
  type ExistsInput,
  type ExistsOutput,
  type MkdirInput,
  type MkdirOutput,
  type RmInput,
  type RmOutput,
  type ReaddirInput,
  type ReaddirOutput,
  type StatInput,
  type StatOutput,
  type CopyInput,
  type CopyOutput,
  type MoveInput,
  type MoveOutput,
  type GlobInput,
  type GlobOutput,
  type ReadJsonInput,
  type ReadJsonOutput,
  ReadOutputSchema,
  WriteOutputSchema,
  ExistsOutputSchema,
  MkdirOutputSchema,
  RmOutputSchema,
  ReaddirOutputSchema,
  StatOutputSchema,
  CopyOutputSchema,
  MoveOutputSchema,
  GlobOutputSchema,
  ReadJsonOutputSchema,
} from "./types.js";
import { fsWriteJson } from "./procedures/fs/write-json.js";
import { fsHash } from "./procedures/fs/hash.js";
import { fsTemp } from "./procedures/fs/temp.js";
import { fsWatch } from "./procedures/fs/watch.js";
import {
  FsWriteJsonInputSchema,
  FsWriteJsonOutputSchema,
  FsHashInputSchema,
  FsHashOutputSchema,
  FsTempInputSchema,
  FsTempOutputSchema,
  FsWatchInputSchema,
  FsWatchOutputSchema,
  type FsWriteJsonInput,
  type FsWriteJsonOutput,
  type FsHashInput,
  type FsHashOutput,
  type FsTempInput,
  type FsTempOutput,
  type FsWatchInput,
  type FsWatchOutput,
} from "./types.js";

// =============================================================================
// Procedure Definitions
// =============================================================================

/** The effects of a procedure that reads the files of the host and changes nothing. */
const READS_FILES: Effects = { reads: ["fs"], writes: [] };

const fsReadProcedure = createProcedure()
  .path(["fs", "read"])
  .input(zodAdapter<ReadInput>(ReadInputSchema))
  .output(zodAdapter<ReadOutput>(ReadOutputSchema))
  .meta({
    description: "Read file contents",
    args: ["path"],
    shorts: { encoding: "e" },
    output: "json",
    effects: READS_FILES,
  })
  .handler(read)
  .build();

const fsWriteProcedure = createProcedure()
  .path(["fs", "write"])
  .input(zodAdapter<WriteInput>(WriteInputSchema))
  .output(zodAdapter<WriteOutput>(WriteOutputSchema))
  .meta({
    description: "Write content to file",
    args: ["path", "content"],
    shorts: { encoding: "e", mode: "m" },
    output: "json",
    // It replaces the file, or appends to it. A second append adds the content again.
    effects: { reads: [], writes: ["fs"] },
  })
  .handler(write)
  .build();

const fsExistsProcedure = createProcedure()
  .path(["fs", "exists"])
  .input(zodAdapter<ExistsInput>(ExistsInputSchema))
  .output(zodAdapter<ExistsOutput>(ExistsOutputSchema))
  .meta({
    description: "Check if file or directory exists",
    args: ["path"],
    shorts: {},
    output: "json",
    effects: READS_FILES,
  })
  .handler(exists)
  .build();

const fsMkdirProcedure = createProcedure()
  .path(["fs", "mkdir"])
  .input(zodAdapter<MkdirInput>(MkdirInputSchema))
  .output(zodAdapter<MkdirOutput>(MkdirOutputSchema))
  .meta({
    description: "Create directory",
    args: ["path"],
    shorts: { recursive: "r" },
    output: "json",
    // It creates only a missing folder. An existing folder gives `created: false`.
    effects: { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true },
  })
  .handler(mkdir)
  .build();

const fsRmProcedure = createProcedure()
  .path(["fs", "rm"])
  .input(zodAdapter<RmInput>(RmInputSchema))
  .output(zodAdapter<RmOutput>(RmOutputSchema))
  .meta({
    description: "Remove file or directory",
    args: ["path"],
    shorts: { recursive: "r", force: "f" },
    output: "json",
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
  })
  .handler(rm)
  .build();

const fsReaddirProcedure = createProcedure()
  .path(["fs", "readdir"])
  .input(zodAdapter<ReaddirInput>(ReaddirInputSchema))
  .output(zodAdapter<ReaddirOutput>(ReaddirOutputSchema))
  .meta({
    description: "Read directory contents",
    args: ["path"],
    shorts: { recursive: "r", includeStats: "s" },
    output: "json",
    effects: READS_FILES,
  })
  .handler(readdir)
  .build();

const fsStatProcedure = createProcedure()
  .path(["fs", "stat"])
  .input(zodAdapter<StatInput>(StatInputSchema))
  .output(zodAdapter<StatOutput>(StatOutputSchema))
  .meta({
    description: "Get file or directory stats",
    args: ["path"],
    shorts: {},
    output: "json",
    effects: READS_FILES,
  })
  .handler(stat)
  .build();

const fsCopyProcedure = createProcedure()
  .path(["fs", "copy"])
  .input(zodAdapter<CopyInput>(CopyInputSchema))
  .output(zodAdapter<CopyOutput>(CopyOutputSchema))
  .meta({
    description: "Copy file or directory. Without overwrite, it refuses an existing destination (EEXIST).",
    args: ["src", "dest"],
    shorts: { recursive: "r", overwrite: "o" },
    output: "json",
    // With `overwrite`, it replaces the files at the destination
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
  })
  .handler(copy)
  .build();

const fsMoveProcedure = createProcedure()
  .path(["fs", "move"])
  .input(zodAdapter<MoveInput>(MoveInputSchema))
  .output(zodAdapter<MoveOutput>(MoveOutputSchema))
  .meta({
    description: "Move or rename file/directory",
    args: ["src", "dest"],
    shorts: { overwrite: "o" },
    output: "json",
    // With `overwrite`, it replaces the destination. A second call finds no source and changes nothing.
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
  })
  .handler(move)
  .build();

const fsGlobProcedure = createProcedure()
  .path(["fs", "glob"])
  .input(zodAdapter<GlobInput>(GlobInputSchema))
  .output(zodAdapter<GlobOutput>(GlobOutputSchema))
  .meta({
    description: "Find files matching glob pattern",
    args: ["pattern"],
    shorts: { cwd: "c", absolute: "a", dot: "d" },
    output: "json",
    effects: READS_FILES,
  })
  .handler(glob)
  .build();

const fsReadJsonProcedure = createProcedure()
  .path(["fs", "read.json"])
  .input(zodAdapter<ReadJsonInput>(ReadJsonInputSchema))
  .output(zodAdapter<ReadJsonOutput>(ReadJsonOutputSchema))
  .meta({
    description: "Read and parse JSON file",
    args: ["path"],
    shorts: {},
    output: "json",
    effects: READS_FILES,
  })
  .handler(readJson)
  .build();

// fs.write.json, fs.hash, fs.temp and fs.watch (roadmap R44)

const fsWriteJsonProcedure = createProcedure()
  .path(["fs", "write.json"])
  .input(zodAdapter<FsWriteJsonInput>(FsWriteJsonInputSchema))
  .output(zodAdapter<FsWriteJsonOutput>(FsWriteJsonOutputSchema))
  .meta({
    description: "Write a value as a JSON file, with a rename at the end",
    args: ["path"],
    shorts: {},
    output: "json",
    // It replaces the file: destructive, and the same input gives the same file
    effects: { reads: [], writes: ["fs"], destructive: true, idempotent: true },
  })
  .handler(fsWriteJson)
  .build();

const fsHashProcedure = createProcedure()
  .path(["fs", "hash"])
  .input(zodAdapter<FsHashInput>(FsHashInputSchema))
  .output(zodAdapter<FsHashOutput>(FsHashOutputSchema))
  .meta({
    description: "The hash of a file",
    args: ["path"],
    shorts: { algorithm: "a" },
    output: "json",
    effects: READS_FILES,
  })
  .handler((input: FsHashInput) => fsHash(input))
  .build();

const fsTempProcedure = createProcedure()
  .path(["fs", "temp"])
  .input(zodAdapter<FsTempInput>(FsTempInputSchema))
  .output(zodAdapter<FsTempOutput>(FsTempOutputSchema))
  .meta({
    description: "Make a temporary folder",
    args: [],
    shorts: {},
    output: "json",
    // It makes a new folder each time, and changes nothing that exists
    effects: { reads: [], writes: ["fs"], destructive: false, idempotent: false },
  })
  .handler((input: FsTempInput) => fsTemp(input))
  .build();

const fsWatchProcedure = createProcedure()
  .path(["fs", "watch"])
  .input(zodAdapter<FsWatchInput>(FsWatchInputSchema))
  .output(zodAdapter<FsWatchOutput>(FsWatchOutputSchema))
  .meta({
    description: "The changes of a file or folder, as a stream",
    args: ["path"],
    shorts: { recursive: "r" },
    output: "streaming",
    effects: READS_FILES,
    // The stream has no end: it stops when the reader stops (roadmap R15)
    stream: { unbounded: true },
  })
  .handler(((input: FsWatchInput, ctx?: { signal?: AbortSignal }) => fsWatch(input, ctx?.signal)) as never)
  .build();

// =============================================================================
// Registration
// =============================================================================

// The root for all the procedures of a registry (roadmap R33)
export { rootDecisionOf, rootRulesOf, type ConfinedRegistry, type RootDecision, type RootKind } from "./confine.js";

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const fsModule: ProcedureModule = defineModule("@procedures/fs", [
    fsReadProcedure,
    fsWriteProcedure,
    fsExistsProcedure,
    fsMkdirProcedure,
    fsRmProcedure,
    fsReaddirProcedure,
    fsStatProcedure,
    fsCopyProcedure,
    fsMoveProcedure,
    fsGlobProcedure,
    fsReadJsonProcedure,
    fsWriteJsonProcedure,
    fsHashProcedure,
    fsTempProcedure,
    fsWatchProcedure,
  ]);

export default fsModule;

/** The options of `createFsModule()`. */
export interface FsModuleOptions {
  /**
   * The folder that confines each path of the procedures (roadmap R33). A relative path of an
   * input starts at the root. A path outside the root gives `FORBIDDEN` with the reason
   * `outside-root`. A relative root starts at the working folder of the process. Without a root,
   * the procedures operate on each path, as `fsModule` does.
   */
  root?: string | undefined;
}

/**
 * This function gives the module of this package. Without `root`, it gives `fsModule`. With
 * `root`, it gives a module with the same name and procedures, whose handlers confine each path
 * of the input to the root. A host gives it to `createRegistry()` before its bundles, so it
 * replaces the `fsModule` that the bundles require (the first module of a name counts).
 */
export function createFsModule(options: FsModuleOptions = {}): ProcedureModule {
  if (options.root === undefined) return fsModule;
  const handlers = rootedHandlers(options.root);
  const procedures = fsModule.procedures.map((procedure): AnyProcedure => {
    const key = procedure.path.join(".");
    const name = HANDLER_NAMES[key];
    // A procedure without a rooted handler would operate outside the root
    if (name === undefined) throw new Error(`The root of @procedures/fs has no handler for ${key}: add it to rootedHandlers()`);
    return { ...procedure, handler: handlers[name] as AnyProcedure["handler"] };
  });
  return defineModule("@procedures/fs", procedures);
}

/** What `confineFsProcedures()` changed. */
export interface ConfinedFs {
  /** The absolute path of the root. */
  root: string;
  /** The keys of the `fs.*` procedures whose handlers now confine each path to the root. */
  procedures: string[];
}

/**
 * This function confines the `fs.*` procedures of a registry to a root (roadmap R33). A host
 * starts it after it builds its registry. It replaces the handler of each `fs.*` procedure of the
 * registry with the handler of `createFsModule({ root })`, and it adds no procedure.
 *
 * A nested call of another procedure (`lib.scan` calls `fs.readdir`) finds the procedure in the
 * registry, so the root confines that call too. The root must be a folder that exists. An `fs.*`
 * procedure that this package does not have is an error, because the root cannot confine it.
 *
 * This function changes only the `fs.*` procedures. A host uses `confineToRoot()`: it also keeps
 * the paths of the other procedures in the root, or it refuses them.
 */
export function confineFsProcedures(registry: ProcedureRegistry, root: string): ConfinedFs {
  const folder = rootFolder(root);
  const rooted = rootedFsProcedures(registry, folder);
  for (const procedure of rooted) registry.register(procedure, { override: true });
  return { root: folder, procedures: rooted.map((procedure) => procedure.path.join(".")) };
}

/** The absolute path of a root. It throws when the root does not exist or is not a folder. */
function rootFolder(root: string): string {
  const folder = resolve(root);
  let isFolder: boolean;
  try {
    isFolder = statSync(folder).isDirectory();
  } catch {
    throw new Error(`The root of the file procedures does not exist: ${folder}`);
  }
  if (!isFolder) throw new Error(`The root of the file procedures is not a folder: ${folder}`);
  return folder;
}

/** The procedures with a root for the `fs.*` procedures of a registry. An unknown `fs.*` procedure is an error. */
function rootedFsProcedures(registry: ProcedureRegistry, folder: string): AnyProcedure[] {
  const rooted = new Map(createFsModule({ root: folder }).procedures.map((procedure) => [procedure.path.join("."), procedure]));
  const present = registry.getAll().filter((procedure) => procedure.path[0] === "fs");
  return present.map((procedure) => {
    const key = procedure.path.join(".");
    const replacement = rooted.get(key);
    if (!replacement) throw new Error(`The root of the file procedures cannot confine ${key}: @procedures/fs has no such procedure`);
    return replacement;
  });
}

/**
 * This function confines each procedure of a registry to a root (roadmap R33). A host starts it
 * after the last registration: `mark --fs-root`, `procedure-server --fs-root` and `MCP_FS_ROOT`.
 *
 * - Each `fs.*` procedure gets the handler of `createFsModule({ root })`, as with
 *   `confineFsProcedures()`.
 * - Each other procedure gets the decision of `rootDecisionOf()`: the host examines its path
 *   inputs (`metadata.fsRoot`), or it refuses the procedure. A procedure that reaches no file
 *   stays as it is.
 *
 * The function adds no procedure, and the names of the tools do not change. It changes nothing
 * when it throws: for a root that does not exist, an unknown `fs.*` procedure, or rules that are
 * not correct.
 */
export function confineToRoot(registry: ProcedureRegistry, root: string): ConfinedRegistry {
  const folder = rootFolder(root);
  const rooted = rootedFsProcedures(registry, folder);
  // Each decision before a change: rules that are not correct throw here
  for (const procedure of registry.getAll()) rootDecisionOf(procedure);
  for (const procedure of rooted) registry.register(procedure, { override: true });
  const others = confineOtherProcedures(registry, folder);
  return { root: folder, fs: rooted.map((procedure) => procedure.path.join(".")), ...others };
}

/**
 * This function registers the procedures of @procedures/fs, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9). With
 * `options.root`, each path of an input must be in the root.
 */
export function registerFsProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: FsModuleOptions = {}): void {
  registerModules(registry, [createFsModule(options)]);
}
