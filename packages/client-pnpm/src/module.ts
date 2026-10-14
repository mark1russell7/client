/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for pnpm operations
 *
 * Provides pnpm.install, pnpm.add, pnpm.remove, pnpm.link, pnpm.run procedures.
 */


import { createProcedure, zodAdapter, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import { pnpmInstall, pnpmAdd, pnpmRemove, pnpmLink, pnpmRun, pnpmStorePath } from "./procedures/pnpm/index.js";
import {
  PnpmInstallInputSchema,
  PnpmAddInputSchema,
  PnpmRemoveInputSchema,
  PnpmLinkInputSchema,
  PnpmRunInputSchema,
  type PnpmInstallInput,
  type PnpmAddInput,
  type PnpmRemoveInput,
  type PnpmLinkInput,
  type PnpmRunInput,
  type PnpmCommandOutput,
  PnpmStorePathInputSchema,
  type PnpmStorePathInput,
  type PnpmStorePathOutput,
  PnpmCommandOutputSchema,
  PnpmStorePathOutputSchema,
} from "./types.js";
import type { ProcedureContext } from "@procedures/client";

// =============================================================================
// Procedures
// =============================================================================

const pnpmInstallProcedure = createProcedure()
  .path(["pnpm", "install"])
  .input(zodAdapter<PnpmInstallInput>(PnpmInstallInputSchema))
  .output(zodAdapter<PnpmCommandOutput>(PnpmCommandOutputSchema))
  .meta({
    description: "Install packages using pnpm",
    // pnpm reads the npm registry, rewrites node_modules and the lockfile, and runs the
    // lifecycle scripts and the pnpmfile of the project
    effects: { reads: ["fs", "network"], writes: ["fs", "process"] },
    shorts: { cwd: "C", dev: "D", frozen: "F" },
    output: "json",
  })
  .handler(async (input: PnpmInstallInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmInstall(input, ctx);
  })
  .build();

const pnpmAddProcedure = createProcedure()
  .path(["pnpm", "add"])
  .input(zodAdapter<PnpmAddInput>(PnpmAddInputSchema))
  .output(zodAdapter<PnpmCommandOutput>(PnpmCommandOutputSchema))
  .meta({
    description: "Add packages using pnpm",
    effects: { reads: ["fs", "network"], writes: ["fs", "process"] },
    args: ["packages"],
    shorts: { cwd: "C", dev: "D", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmAddInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmAdd(input, ctx);
  })
  .build();

const pnpmRemoveProcedure = createProcedure()
  .path(["pnpm", "remove"])
  .input(zodAdapter<PnpmRemoveInput>(PnpmRemoveInputSchema))
  .output(zodAdapter<PnpmCommandOutput>(PnpmCommandOutputSchema))
  .meta({
    description: "Remove packages using pnpm",
    // pnpm resolves the remaining dependencies again, so it can read the npm registry
    effects: { reads: ["fs", "network"], writes: ["fs", "process"] },
    args: ["packages"],
    shorts: { cwd: "C", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmRemoveInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmRemove(input, ctx);
  })
  .build();

const pnpmLinkProcedure = createProcedure()
  .path(["pnpm", "link"])
  .input(zodAdapter<PnpmLinkInput>(PnpmLinkInputSchema))
  .output(zodAdapter<PnpmCommandOutput>(PnpmCommandOutputSchema))
  .meta({
    description: "Link packages using pnpm",
    effects: { reads: ["fs", "network"], writes: ["fs", "process"] },
    shorts: { cwd: "C", global: "g" },
    output: "json",
  })
  .handler(async (input: PnpmLinkInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmLink(input, ctx);
  })
  .build();

const pnpmRunProcedure = createProcedure()
  .path(["pnpm", "run"])
  .input(zodAdapter<PnpmRunInput>(PnpmRunInputSchema))
  .output(zodAdapter<PnpmCommandOutput>(PnpmCommandOutputSchema))
  .meta({
    description: "Run package scripts using pnpm",
    // A package script is code of the project: it can do anything
    effects: { reads: ["fs"], writes: ["process"] },
    args: ["script"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: PnpmRunInput, ctx: ProcedureContext): Promise<PnpmCommandOutput> => {
    return pnpmRun(input, ctx);
  })
  .build();

const pnpmStorePathProcedure = createProcedure()
  .path(["pnpm", "store", "path"])
  .input(zodAdapter<PnpmStorePathInput>(PnpmStorePathInputSchema))
  .output(zodAdapter<PnpmStorePathOutput>(PnpmStorePathOutputSchema))
  .meta({
    description: "Get pnpm store path for snapshot/restore",
    // `pnpm store path` only reads the configuration of pnpm
    effects: { reads: ["fs"], writes: [] },
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: PnpmStorePathInput): Promise<PnpmStorePathOutput> => {
    return pnpmStorePath(input);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const pnpmModule: ProcedureModule = defineModule("@procedures/pnpm", [
    pnpmInstallProcedure,
    pnpmAddProcedure,
    pnpmRemoveProcedure,
    pnpmLinkProcedure,
    pnpmRunProcedure,
    pnpmStorePathProcedure,
  ], [shellModule]);

export default pnpmModule;

/**
 * This function registers the procedures of @procedures/pnpm, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerPnpmProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [pnpmModule]);
}
