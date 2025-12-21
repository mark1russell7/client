/**
 * Procedure Registration for snapshot operations
 *
 * Provides snapshot.create, snapshot.list, snapshot.restore, snapshot.diff, snapshot.delete procedures.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
import type { ProcedureContext } from "@mark1russell7/client";
import {
  snapshotCreate,
  snapshotList,
  snapshotRestore,
  snapshotDiff,
  snapshotDelete,
} from "./procedures/snapshot/index.js";
import {
  SnapshotCreateInputSchema,
  SnapshotListInputSchema,
  SnapshotRestoreInputSchema,
  SnapshotDiffInputSchema,
  SnapshotDeleteInputSchema,
  type SnapshotCreateInput,
  type SnapshotCreateOutput,
  type SnapshotListInput,
  type SnapshotListOutput,
  type SnapshotRestoreInput,
  type SnapshotRestoreOutput,
  type SnapshotDiffInput,
  type SnapshotDiffOutput,
  type SnapshotDeleteInput,
  type SnapshotDeleteOutput,
} from "./types.js";

// =============================================================================
// Minimal Schema Adapter
// =============================================================================

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
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
// Procedures
// =============================================================================

const snapshotCreateProcedure = createProcedure()
  .path(["snapshot", "create"])
  .input(zodAdapter<SnapshotCreateInput>(SnapshotCreateInputSchema))
  .output(outputSchema<SnapshotCreateOutput>())
  .meta({
    description: "Create environment snapshot and upload to S3",
    args: ["name"],
    shorts: { bucket: "b", preset: "p", description: "d" },
    output: "json",
  })
  .handler(async (input: SnapshotCreateInput, ctx: ProcedureContext): Promise<SnapshotCreateOutput> => {
    return snapshotCreate(input, ctx);
  })
  .build();

const snapshotListProcedure = createProcedure()
  .path(["snapshot", "list"])
  .input(zodAdapter<SnapshotListInput>(SnapshotListInputSchema))
  .output(outputSchema<SnapshotListOutput>())
  .meta({
    description: "List available snapshots in S3 bucket",
    args: [],
    shorts: { bucket: "b", prefix: "p", maxResults: "n" },
    output: "json",
  })
  .handler(async (input: SnapshotListInput, ctx: ProcedureContext): Promise<SnapshotListOutput> => {
    return snapshotList(input, ctx);
  })
  .build();

const snapshotRestoreProcedure = createProcedure()
  .path(["snapshot", "restore"])
  .input(zodAdapter<SnapshotRestoreInput>(SnapshotRestoreInputSchema))
  .output(outputSchema<SnapshotRestoreOutput>())
  .meta({
    description: "Restore environment from S3 snapshot",
    args: ["id"],
    shorts: { bucket: "b", targetPath: "t", overwrite: "f" },
    output: "json",
  })
  .handler(async (input: SnapshotRestoreInput, ctx: ProcedureContext): Promise<SnapshotRestoreOutput> => {
    return snapshotRestore(input, ctx);
  })
  .build();

const snapshotDiffProcedure = createProcedure()
  .path(["snapshot", "diff"])
  .input(zodAdapter<SnapshotDiffInput>(SnapshotDiffInputSchema))
  .output(outputSchema<SnapshotDiffOutput>())
  .meta({
    description: "Compare current state against a snapshot",
    args: ["id"],
    shorts: { bucket: "b" },
    output: "json",
  })
  .handler(async (input: SnapshotDiffInput, ctx: ProcedureContext): Promise<SnapshotDiffOutput> => {
    return snapshotDiff(input, ctx);
  })
  .build();

const snapshotDeleteProcedure = createProcedure()
  .path(["snapshot", "delete"])
  .input(zodAdapter<SnapshotDeleteInput>(SnapshotDeleteInputSchema))
  .output(outputSchema<SnapshotDeleteOutput>())
  .meta({
    description: "Delete a snapshot from S3",
    args: ["id"],
    shorts: { bucket: "b" },
    output: "json",
  })
  .handler(async (input: SnapshotDeleteInput, ctx: ProcedureContext): Promise<SnapshotDeleteOutput> => {
    return snapshotDelete(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerSnapshotProcedures(): void {
  registerProcedures([
    snapshotCreateProcedure,
    snapshotListProcedure,
    snapshotRestoreProcedure,
    snapshotDiffProcedure,
    snapshotDeleteProcedure,
  ]);
}

// Auto-register
registerSnapshotProcedures();
