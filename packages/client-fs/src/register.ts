/**
 * Procedure Registration for filesystem operations
 *
 * Registers fs.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
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
} from "./types.js";

// =============================================================================
// Minimal Schema Adapter (wraps Zod for client procedure system)
// =============================================================================

interface ZodErrorLike {
  message: string;
  errors: Array<{ path: (string | number)[]; message: string }>;
}

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: ZodErrorLike };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

// =============================================================================
// Procedure Definitions
// =============================================================================

const fsReadProcedure = createProcedure()
  .path(["fs", "read"])
  .input(zodAdapter<ReadInput>(ReadInputSchema))
  .output(outputSchema<ReadOutput>())
  .meta({
    description: "Read file contents",
    args: ["path"],
    shorts: { encoding: "e" },
    output: "json",
  })
  .handler(read)
  .build();

const fsWriteProcedure = createProcedure()
  .path(["fs", "write"])
  .input(zodAdapter<WriteInput>(WriteInputSchema))
  .output(outputSchema<WriteOutput>())
  .meta({
    description: "Write content to file",
    args: ["path", "content"],
    shorts: { encoding: "e", mode: "m" },
    output: "json",
  })
  .handler(write)
  .build();

const fsExistsProcedure = createProcedure()
  .path(["fs", "exists"])
  .input(zodAdapter<ExistsInput>(ExistsInputSchema))
  .output(outputSchema<ExistsOutput>())
  .meta({
    description: "Check if file or directory exists",
    args: ["path"],
    shorts: {},
    output: "json",
  })
  .handler(exists)
  .build();

const fsMkdirProcedure = createProcedure()
  .path(["fs", "mkdir"])
  .input(zodAdapter<MkdirInput>(MkdirInputSchema))
  .output(outputSchema<MkdirOutput>())
  .meta({
    description: "Create directory",
    args: ["path"],
    shorts: { recursive: "r" },
    output: "json",
  })
  .handler(mkdir)
  .build();

const fsRmProcedure = createProcedure()
  .path(["fs", "rm"])
  .input(zodAdapter<RmInput>(RmInputSchema))
  .output(outputSchema<RmOutput>())
  .meta({
    description: "Remove file or directory",
    args: ["path"],
    shorts: { recursive: "r", force: "f" },
    output: "json",
  })
  .handler(rm)
  .build();

const fsReaddirProcedure = createProcedure()
  .path(["fs", "readdir"])
  .input(zodAdapter<ReaddirInput>(ReaddirInputSchema))
  .output(outputSchema<ReaddirOutput>())
  .meta({
    description: "Read directory contents",
    args: ["path"],
    shorts: { recursive: "r", includeStats: "s" },
    output: "json",
  })
  .handler(readdir)
  .build();

const fsStatProcedure = createProcedure()
  .path(["fs", "stat"])
  .input(zodAdapter<StatInput>(StatInputSchema))
  .output(outputSchema<StatOutput>())
  .meta({
    description: "Get file or directory stats",
    args: ["path"],
    shorts: {},
    output: "json",
  })
  .handler(stat)
  .build();

const fsCopyProcedure = createProcedure()
  .path(["fs", "copy"])
  .input(zodAdapter<CopyInput>(CopyInputSchema))
  .output(outputSchema<CopyOutput>())
  .meta({
    description: "Copy file or directory",
    args: ["src", "dest"],
    shorts: { recursive: "r", overwrite: "o" },
    output: "json",
  })
  .handler(copy)
  .build();

const fsMoveProcedure = createProcedure()
  .path(["fs", "move"])
  .input(zodAdapter<MoveInput>(MoveInputSchema))
  .output(outputSchema<MoveOutput>())
  .meta({
    description: "Move or rename file/directory",
    args: ["src", "dest"],
    shorts: { overwrite: "o" },
    output: "json",
  })
  .handler(move)
  .build();

const fsGlobProcedure = createProcedure()
  .path(["fs", "glob"])
  .input(zodAdapter<GlobInput>(GlobInputSchema))
  .output(outputSchema<GlobOutput>())
  .meta({
    description: "Find files matching glob pattern",
    args: ["pattern"],
    shorts: { cwd: "c", absolute: "a", dot: "d" },
    output: "json",
  })
  .handler(glob)
  .build();

const fsReadJsonProcedure = createProcedure()
  .path(["fs", "read.json"])
  .input(zodAdapter<ReadJsonInput>(ReadJsonInputSchema))
  .output(outputSchema<ReadJsonOutput>())
  .meta({
    description: "Read and parse JSON file",
    args: ["path"],
    shorts: {},
    output: "json",
  })
  .handler(readJson)
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerFsProcedures(): void {
  registerProcedures([
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
  ]);
}

// Auto-register when this module is loaded
registerFsProcedures();
