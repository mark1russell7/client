/**
 * The procedures of the program store (roadmap 3.2):
 *
 * - `procedure.store`: write the program of a runtime-defined procedure to the store.
 * - `procedure.load`: define the stored programs again, through `procedure.define`.
 * - `procedure.sync`: push the programs of the registry, pull the stored ones, or both.
 * - `procedure.remote`: the status of the store. A store's backend is fixed when a host makes
 *   it, so `connect` and `disconnect` are NOT_IMPLEMENTED: a procedure that could point the
 *   store at a new endpoint would give a caller network reach.
 *
 * They use the program store of the caller's registry (`attachProgramStore`). A loaded program
 * is a runtime-defined procedure again: data-driven, so a server with an expose rule lets it
 * call only the exposed procedures. Load programs only from a store that you trust: a host with
 * no expose rule runs whatever a program calls.
 */

import { z } from "zod";
import {
  createProcedure,
  getAllRuntimeProcedures,
  keyToPath,
  outputSchema,
  pathToKey,
  runtimeProgramOf,
  zodAdapter,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedurePath,
} from "@procedures/client";
import { ProcedureStoreError } from "../errors.js";
import { callerRegistry, getProgramStore, requireProgramStore } from "./attach.js";
import type { ProgramStore, StoredProgram } from "./types.js";

// =============================================================================
// Shared
// =============================================================================

const pathField = z
  .union([z.array(z.string().min(1)).min(1), z.string().min(1)])
  .describe('The path of the procedure: a list of segments, or a dotted key such as "reports.weekly"');

function toPath(path: ProcedurePath | string): ProcedurePath {
  return typeof path === "string" ? keyToPath(path) : path;
}

/** The metadata to store: the procedure's metadata without the program (the store keeps that). */
function storedMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const { aggregation: _aggregation, generatedFrom: _generatedFrom, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** The record of a runtime-defined procedure, or a NOT_A_PROGRAM error for a code procedure. */
function recordOf(ctx: ProcedureContext, path: ProcedurePath): StoredProgram {
  const key = pathToKey(path);
  const procedure = callerRegistry(ctx).get(path);
  if (!procedure) {
    throw new Error(`Procedure not found: ${key}`);
  }
  const program = runtimeProgramOf(procedure);
  if (!program) {
    throw new ProcedureStoreError(
      "NOT_A_PROGRAM",
      `${key} is a code procedure. Only a procedure that procedure.define made is a program: code lives in a package.`
    );
  }
  return { key, path: [...procedure.path], program, metadata: storedMetadata(procedure.metadata), storedAt: Date.now() };
}

interface LoadResult {
  loaded: number;
  conflicts: Array<{ path: ProcedurePath; reason: string }>;
}

/** Define each program again in the caller's registry, through procedure.define. */
async function definePrograms(ctx: ProcedureContext, programs: StoredProgram[]): Promise<LoadResult> {
  const result: LoadResult = { loaded: 0, conflicts: [] };
  for (const stored of programs) {
    try {
      await ctx.client.call(["procedure", "define"], {
        path: stored.path,
        aggregation: stored.program,
        ...(stored.metadata ? { metadata: stored.metadata } : {}),
        // A stored program replaces a runtime-defined procedure. procedure.define never replaces
        // a code procedure: that is a conflict.
        replace: true,
      });
      result.loaded++;
    } catch (error) {
      result.conflicts.push({ path: stored.path, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

// =============================================================================
// procedure.store
// =============================================================================

interface StoreInput {
  path: ProcedurePath | string;
}

interface StoreOutput {
  stored: true;
  path: ProcedurePath;
  storedAt: number;
}

export const procedureStoreProcedure: AnyProcedure = createProcedure()
  .path(["procedure", "store"])
  .input(zodAdapter<StoreInput>(z.object({ path: pathField })))
  .output(
    zodAdapter<StoreOutput>(
      z.object({
        stored: z.literal(true).describe("True: the store has the program"),
        path: z.array(z.string()).describe("The path of the procedure"),
        storedAt: z.number().describe("When the store got the program, in milliseconds since 1970"),
      })
    )
  )
  .meta({
    description: "Write the program of a procedure that procedure.define made to the program store",
    tags: ["procedure", "registry", "storage"],
    // It replaces a stored program of the same key. A FileProgramStore keeps the programs in a file.
    effects: { reads: ["registry"], writes: ["fs", "programs"] },
    args: ["path"],
  })
  .handler(async (input: StoreInput, ctx: ProcedureContext): Promise<StoreOutput> => {
    const store = requireProgramStore(ctx, "procedure.store");
    const record = recordOf(ctx, toPath(input.path));
    await store.put(record);
    return { stored: true, path: record.path, storedAt: record.storedAt };
  })
  .build();

// =============================================================================
// procedure.load
// =============================================================================

interface LoadInput {
  path?: ProcedurePath | string | undefined;
  prefix?: ProcedurePath | string | undefined;
  all?: boolean | undefined;
}

interface LoadOutput {
  /** The number of programs that the load defined */
  loaded: number;
  /** The paths of the stored programs that matched */
  paths: ProcedurePath[];
  /** The programs that the load could not define (a code procedure at the path, an invalid program) */
  conflicts: Array<{ path: ProcedurePath; reason: string }>;
  message: string;
}

const conflictsField = z
  .array(z.object({ path: z.array(z.string()), reason: z.string() }))
  .describe("The programs that could not be defined, with the reason");

export const procedureLoadProcedure: AnyProcedure = createProcedure()
  .path(["procedure", "load"])
  .input(
    zodAdapter<LoadInput>(
      z.object({
        path: pathField.optional(),
        prefix: pathField.optional().describe("Load the programs of this path and under it"),
        all: z.boolean().optional().describe("Load every stored program"),
      })
    )
  )
  .output(
    zodAdapter<LoadOutput>(
      z.object({
        loaded: z.number().describe("The number of programs that the load defined"),
        paths: z.array(z.array(z.string())).describe("The paths of the stored programs that matched"),
        conflicts: conflictsField,
        message: z.string(),
      })
    )
  )
  .meta({
    description: "Define the stored programs again (procedure.define), after a restart",
    tags: ["procedure", "registry", "storage"],
    calls: ["procedure.define"],
    // A loaded program replaces a runtime-defined procedure of the same path
    effects: { reads: ["fs", "programs", "registry"], writes: ["registry"] },
  })
  .handler(async (input: LoadInput, ctx: ProcedureContext): Promise<LoadOutput> => {
    const chosen = [input.path !== undefined, input.prefix !== undefined, input.all === true].filter(Boolean).length;
    if (chosen !== 1) {
      throw new Error("procedure.load needs exactly one of `path`, `prefix` or `all: true`");
    }
    const store = requireProgramStore(ctx, "procedure.load");
    let programs: StoredProgram[];
    let what: string;
    if (input.path !== undefined) {
      what = pathToKey(toPath(input.path));
      const program = await store.get(what);
      programs = program ? [program] : [];
    } else if (input.prefix !== undefined) {
      const prefix = pathToKey(toPath(input.prefix));
      what = `${prefix}.*`;
      programs = await store.list(prefix);
    } else {
      what = "all programs";
      programs = await store.list();
    }
    const result = await definePrograms(ctx, programs);
    return {
      loaded: result.loaded,
      paths: programs.map((p) => p.path),
      conflicts: result.conflicts,
      message: `Loaded ${result.loaded} of ${programs.length} stored program(s) for ${what}`,
    };
  })
  .build();

// =============================================================================
// procedure.sync
// =============================================================================

interface SyncInput {
  direction?: "push" | "pull" | "both" | undefined;
}

interface SyncOutput {
  pushed: number;
  pulled: number;
  conflicts: Array<{ path: ProcedurePath; reason: string }>;
  message: string;
}

/** Write each runtime-defined procedure of the caller's registry to the store. */
async function push(ctx: ProcedureContext, store: ProgramStore): Promise<number> {
  let pushed = 0;
  for (const procedure of getAllRuntimeProcedures(callerRegistry(ctx))) {
    await store.put(recordOf(ctx, procedure.path));
    pushed++;
  }
  return pushed;
}

export const procedureSyncProcedure: AnyProcedure = createProcedure()
  .path(["procedure", "sync"])
  .input(
    zodAdapter<SyncInput>(
      z.object({
        direction: z
          .enum(["push", "pull", "both"])
          .optional()
          .describe(
            "push: write the programs of the registry to the store. pull: define the stored programs. " +
              "both (the default): push, then pull the stored programs that the registry does not have"
          ),
      })
    )
  )
  .output(
    zodAdapter<SyncOutput>(
      z.object({
        pushed: z.number().describe("The number of programs written to the store"),
        pulled: z.number().describe("The number of stored programs defined in the registry"),
        conflicts: conflictsField,
        message: z.string(),
      })
    )
  )
  .meta({
    description: "Synchronize the runtime-defined procedures of the registry with the program store",
    tags: ["procedure", "registry", "storage"],
    calls: ["procedure.define"],
    effects: { reads: ["fs", "programs", "registry"], writes: ["fs", "programs", "registry"] },
  })
  .handler(async (input: SyncInput, ctx: ProcedureContext): Promise<SyncOutput> => {
    const direction = input.direction ?? "both";
    const store = requireProgramStore(ctx, "procedure.sync");
    const pushed = direction === "pull" ? 0 : await push(ctx, store);
    let pulled = 0;
    let conflicts: SyncOutput["conflicts"] = [];
    if (direction !== "push") {
      const registry = callerRegistry(ctx);
      const stored = await store.list();
      // With "both", the registry wins: a program that it has was pushed, and is not pulled back
      const toPull = direction === "pull" ? stored : stored.filter((p) => !registry.get(p.path));
      const result = await definePrograms(ctx, toPull);
      pulled = result.loaded;
      conflicts = result.conflicts;
    }
    return { pushed, pulled, conflicts, message: `Sync ${direction}: pushed ${pushed}, pulled ${pulled}` };
  })
  .build();

// =============================================================================
// procedure.remote
// =============================================================================

interface RemoteInput {
  action: "status" | "connect" | "disconnect";
}

interface RemoteOutput {
  /** True when the caller's registry has a program store */
  configured: boolean;
  /** The kind of the store: memory, file, collection */
  kind?: string | undefined;
  message: string;
}

export const procedureRemoteProcedure: AnyProcedure = createProcedure()
  .path(["procedure", "remote"])
  .input(
    zodAdapter<RemoteInput>(
      z.object({
        action: z
          .enum(["status", "connect", "disconnect"])
          .describe("status: the store of the registry. connect and disconnect: not implemented (the host makes the store)"),
      })
    )
  )
  .output(outputSchema<RemoteOutput>())
  .meta({
    description: "The status of the program store of the registry",
    tags: ["procedure", "registry", "storage"],
    // It gives the kind of the store. `connect` and `disconnect` change nothing: they fail.
    effects: { reads: ["programs"], writes: [] },
    args: ["action"],
  })
  .handler(async (input: RemoteInput, ctx: ProcedureContext): Promise<RemoteOutput> => {
    if (input.action === "status") {
      const store = getProgramStore(callerRegistry(ctx));
      return store
        ? { configured: true, kind: store.kind, message: `The registry has a ${store.kind} program store` }
        : { configured: false, message: "The registry has no program store" };
    }
    throw new ProcedureStoreError(
      "NOT_IMPLEMENTED",
      `procedure.remote ${input.action} cannot change the store of a registry at run time. A host makes the store, ` +
        "for example new CollectionProgramStore(new ApiStorage(client, { collection: \"programs\" })), and gives it " +
        "to the registry with attachProgramStore()."
    );
  })
  .build();

/** The procedures of the program store. */
export const programStoreProcedures: AnyProcedure[] = [
  procedureStoreProcedure,
  procedureLoadProcedure,
  procedureSyncProcedure,
  procedureRemoteProcedure,
];
