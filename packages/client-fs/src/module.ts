/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for filesystem operations
 *
 * Registers fs.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 *
 * `fsModule` operates on each path. `createFsModule({ root })` gives the same procedures, and
 * each path of their input must be in the root (roadmap R33, `root.ts`).
 */

import { createProcedure, zodAdapter, defineModule, type AnyProcedure, type Effects, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import { HANDLER_NAMES, rootedHandlers } from "./handlers.js";
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

/**
 * This function registers the procedures of @procedures/fs, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9). With
 * `options.root`, each path of an input must be in the root.
 */
export function registerFsProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: FsModuleOptions = {}): void {
  registerModules(registry, [createFsModule(options)]);
}
