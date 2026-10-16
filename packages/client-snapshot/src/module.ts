/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for snapshot operations
 *
 * Provides snapshot.create, snapshot.list, snapshot.restore, snapshot.diff, snapshot.delete procedures.
 */

import { createProcedure, zodAdapter, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import type { ProcedureContext } from "@procedures/client";
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
  SnapshotCreateOutputSchema,
  SnapshotRestoreOutputSchema,
  SnapshotListOutputSchema,
  SnapshotDiffOutputSchema,
  SnapshotDeleteOutputSchema,
} from "./types.js";

// =============================================================================
// Procedures
// =============================================================================

const snapshotCreateProcedure = createProcedure()
  .path(["snapshot", "create"])
  .input(zodAdapter<SnapshotCreateInput>(SnapshotCreateInputSchema))
  .output(zodAdapter<SnapshotCreateOutput>(SnapshotCreateOutputSchema))
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
  .output(zodAdapter<SnapshotListOutput>(SnapshotListOutputSchema))
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
  .output(zodAdapter<SnapshotRestoreOutput>(SnapshotRestoreOutputSchema))
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
  .output(zodAdapter<SnapshotDiffOutput>(SnapshotDiffOutputSchema))
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
  .output(zodAdapter<SnapshotDeleteOutput>(SnapshotDeleteOutputSchema))
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

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const snapshotModule: ProcedureModule = defineModule("@procedures/snapshot", [
    snapshotCreateProcedure,
    snapshotListProcedure,
    snapshotRestoreProcedure,
    snapshotDiffProcedure,
    snapshotDeleteProcedure,
  ]);

export default snapshotModule;

/**
 * This function registers the procedures of @procedures/snapshot, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerSnapshotProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [snapshotModule]);
}
