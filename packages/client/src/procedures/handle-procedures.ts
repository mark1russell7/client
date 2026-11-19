/**
 * The procedures of the handle scope of a caller (d40-handles): `handle.list` and `handle.close`.
 * A host whose procedures open objects registers `handleModule`. The face of the host gives each
 * owner its scope (`ServerRequest.handles`).
 */

import * as z from "zod";
import { defineProcedure } from "./define.js";
import { handleScopeOf, type HandleInfo } from "./handles.js";
import type { Procedure, ProcedureContext, ProcedureMetadata, ProcedureModule } from "./types.js";

/** The input of `handle.list`. */
export interface HandleListInput {
  /** Only the objects of this kind, for example `"sqlite.Database"`. */
  kind?: string | undefined;
}

/** The output of `handle.list`. */
export interface HandleListOutput {
  handles: HandleInfo[];
  count: number;
}

const HandleInfoSchema = z.object({
  handle: z.string().describe("The id of the handle"),
  kind: z.string().describe('The kind of the object, for example "sqlite.Database"'),
  label: z.string().optional().describe("A short text that tells the object apart, for example the path of a file"),
  openedAt: z.number().describe("The time of the open, in milliseconds since the epoch"),
  usedAt: z.number().describe("The time of the last use (the open, or the last get), in milliseconds since the epoch"),
});

/** The procedure `handle.list`: the open objects of the caller, in the order of their open. */
export const handleListProcedure: Procedure<HandleListInput, HandleListOutput, ProcedureMetadata> = defineProcedure({
  path: ["handle", "list"],
  input: z.object({ kind: z.string().optional().describe("Only the objects of this kind") }) as z.ZodType<HandleListInput>,
  output: z.object({
    handles: z.array(HandleInfoSchema).describe("The open objects of the caller, in the order of their open"),
    count: z.number().describe("The count of the handles in the list"),
  }) as z.ZodType<HandleListOutput>,
  metadata: {
    description: "The open handles of the caller: the objects with a state that its procedures opened",
    tags: ["core", "handles"],
    args: [],
    shorts: { kind: "k" },
    output: "json",
    effects: { reads: ["handles"], writes: [] },
  },
  handler: async (input: HandleListInput, ctx?: ProcedureContext) => {
    const all = handleScopeOf(ctx).list();
    const handles = input.kind === undefined ? all : all.filter((info) => info.kind === input.kind);
    return { handles, count: handles.length };
  },
});

/** The input of `handle.close`. */
export interface HandleCloseInput {
  /** The id of the handle. */
  handle: string;
}

/** The procedure `handle.close`: it closes an object of the caller. `closed` is false for a handle that is not open. */
export const handleCloseProcedure: Procedure<HandleCloseInput, { closed: boolean }, ProcedureMetadata> = defineProcedure({
  path: ["handle", "close"],
  input: z.object({ handle: z.string().min(1).describe("The id of the handle") }) as z.ZodType<HandleCloseInput>,
  output: z.object({ closed: z.boolean().describe("True when the handle was open and is now closed. False for a handle that is not open.") }),
  metadata: {
    description: "Close a handle of the caller and its object, for example a database",
    tags: ["core", "handles"],
    args: ["handle"],
    output: "json",
    effects: { reads: ["handles"], writes: ["handles"], idempotent: true, destructive: false },
  },
  handler: async (input: HandleCloseInput, ctx?: ProcedureContext) => ({ closed: await handleScopeOf(ctx).close(input.handle) }),
});

/** The module of the handle procedures. A host whose procedures open objects registers it. */
export const handleModule: ProcedureModule = {
  name: "@procedures/client/handles",
  procedures: [handleListProcedure, handleCloseProcedure],
};
