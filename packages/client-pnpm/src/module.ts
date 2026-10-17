/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for pnpm operations
 *
 * Provides pnpm.install, pnpm.add, pnpm.remove, pnpm.link, pnpm.run procedures.
 */


import { createProcedure, zodAdapter, defineModule, type AnyProcedure, type FsRootRules, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
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
import { pnpmExec } from "./procedures/pnpm/exec.js";
import { pnpmList } from "./procedures/pnpm/list.js";
import { pnpmWhy } from "./procedures/pnpm/why.js";
import { pnpmOutdated } from "./procedures/pnpm/outdated.js";
import { pnpmUpdate } from "./procedures/pnpm/update.js";
import { pnpmPack } from "./procedures/pnpm/pack.js";
import {
  PnpmExecInputSchema,
  PnpmExecOutputSchema,
  type PnpmExecInput,
  type PnpmExecOutput,
  PnpmListInputSchema,
  PnpmListOutputSchema,
  type PnpmListInput,
  type PnpmListOutput,
  PnpmWhyInputSchema,
  PnpmWhyOutputSchema,
  type PnpmWhyInput,
  type PnpmWhyOutput,
  PnpmOutdatedInputSchema,
  PnpmOutdatedOutputSchema,
  type PnpmOutdatedInput,
  type PnpmOutdatedOutput,
  PnpmUpdateInputSchema,
  PnpmUpdateOutputSchema,
  type PnpmUpdateInput,
  type PnpmUpdateOutput,
  PnpmPackInputSchema,
  PnpmPackOutputSchema,
  type PnpmPackInput,
  type PnpmPackOutput,
} from "./types.js";

// =============================================================================
// Procedures
// =============================================================================

const pnpmInstallProcedure = createProcedure()
  .path(["pnpm", "install"])
  .input(zodAdapter<PnpmInstallInput>(PnpmInstallInputSchema))
  .output(zodAdapter<PnpmCommandOutput>(PnpmCommandOutputSchema))
  .meta({
    description: "Install packages using pnpm",
    calls: ["shell.run"],
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
    calls: ["shell.run"],
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
    calls: ["shell.run"],
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
    calls: ["shell.run"],
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
    calls: ["shell.run"],
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
// Roadmap R41: exec, list, why, outdated, update, pack
// =============================================================================

const pnpmExecProcedure = createProcedure()
  .path(["pnpm", "exec"])
  .input(zodAdapter<PnpmExecInput>(PnpmExecInputSchema))
  .output(zodAdapter<PnpmExecOutput>(PnpmExecOutputSchema))
  .meta({
    description: "Run a program of the dependencies (node_modules/.bin) with pnpm exec",
    calls: ["shell.run"],
    // The program is any program of the dependencies: it can do anything, as pnpm.run
    effects: { reads: ["fs"], writes: ["process"] },
    args: ["command", "args"],
    shorts: { cwd: "C", recursive: "r" },
    output: "json",
  })
  .handler(async (input: PnpmExecInput, ctx: ProcedureContext): Promise<PnpmExecOutput> => pnpmExec(input, ctx))
  .build();

const pnpmListProcedure = createProcedure()
  .path(["pnpm", "list"])
  .input(zodAdapter<PnpmListInput>(PnpmListInputSchema))
  .output(zodAdapter<PnpmListOutput>(PnpmListOutputSchema))
  .meta({
    description: "List the installed packages: data is the JSON of pnpm list --json",
    calls: ["shell.run"],
    // It reads package.json, the lockfile and node_modules
    effects: { reads: ["fs"], writes: [] },
    args: ["packages"],
    shorts: { cwd: "C", depth: "d", recursive: "r" },
    output: "json",
  })
  .handler(async (input: PnpmListInput, ctx: ProcedureContext): Promise<PnpmListOutput> => pnpmList(input, ctx))
  .build();

const pnpmWhyProcedure = createProcedure()
  .path(["pnpm", "why"])
  .input(zodAdapter<PnpmWhyInput>(PnpmWhyInputSchema))
  .output(zodAdapter<PnpmWhyOutput>(PnpmWhyOutputSchema))
  .meta({
    description: "Show the packages that depend on a package: data is the JSON of pnpm why --json",
    calls: ["shell.run"],
    effects: { reads: ["fs"], writes: [] },
    args: ["packages"],
    shorts: { cwd: "C", depth: "d", recursive: "r" },
    output: "json",
  })
  .handler(async (input: PnpmWhyInput, ctx: ProcedureContext): Promise<PnpmWhyOutput> => pnpmWhy(input, ctx))
  .build();

const pnpmOutdatedProcedure = createProcedure()
  .path(["pnpm", "outdated"])
  .input(zodAdapter<PnpmOutdatedInput>(PnpmOutdatedInputSchema))
  .output(zodAdapter<PnpmOutdatedOutput>(PnpmOutdatedOutputSchema))
  .meta({
    description: "List the outdated packages: data is the JSON of pnpm outdated",
    calls: ["shell.run"],
    // pnpm reads the versions of the npm registry
    effects: { reads: ["fs", "network"], writes: [] },
    args: ["packages"],
    shorts: { cwd: "C", recursive: "r" },
    output: "json",
  })
  .handler(async (input: PnpmOutdatedInput, ctx: ProcedureContext): Promise<PnpmOutdatedOutput> => pnpmOutdated(input, ctx))
  .build();

const pnpmUpdateProcedure = createProcedure()
  .path(["pnpm", "update"])
  .input(zodAdapter<PnpmUpdateInput>(PnpmUpdateInputSchema))
  .output(zodAdapter<PnpmUpdateOutput>(PnpmUpdateOutputSchema))
  .meta({
    description: "Update packages to their newest versions in the ranges, or with latest to the latest versions",
    calls: ["shell.run"],
    // As pnpm.install: the registry, node_modules, the lockfile and the lifecycle scripts
    effects: { reads: ["fs", "network"], writes: ["fs", "process"] },
    args: ["packages"],
    shorts: { cwd: "C", latest: "L", recursive: "r" },
    output: "json",
  })
  .handler(async (input: PnpmUpdateInput, ctx: ProcedureContext): Promise<PnpmUpdateOutput> => pnpmUpdate(input, ctx))
  .build();

const pnpmPackProcedure = createProcedure()
  .path(["pnpm", "pack"])
  .input(zodAdapter<PnpmPackInput>(PnpmPackInputSchema))
  .output(zodAdapter<PnpmPackOutput>(PnpmPackOutputSchema))
  .meta({
    description: "Make a tarball of the package: data gives its file name and files",
    calls: ["shell.run"],
    // It writes the tarball (it replaces a tarball of the same name), and pnpm runs the prepack,
    // prepare and postpack scripts of the package
    effects: { reads: ["fs"], writes: ["fs", "process"] },
    args: [],
    shorts: { cwd: "C", destination: "d", dryRun: "n" },
    output: "json",
  })
  .handler(async (input: PnpmPackInput, ctx: ProcedureContext): Promise<PnpmPackOutput> => pnpmPack(input, ctx))
  .build();

// =============================================================================
// The rule under a root of the files (roadmap R33)
// =============================================================================

/**
 * The rule of each pnpm procedure under a root of the files: a host with a root refuses it.
 * - pnpm reads the workspace and the configuration (`.npmrc`) in the folders above the working
 *   folder, and the store is outside the project.
 * - install, add, update, run and exec start the scripts of the project, and `.pnpmfile.cjs` is
 *   code. A client with `fs.write` in the root can write them.
 */
const REFUSED_UNDER_A_ROOT: FsRootRules = {
  refuse: "pnpm reads the workspace, the store and the configuration outside the working folder, and the scripts of a project start programs",
};

/** The procedure with the rule of a root. */
function underARoot(procedure: AnyProcedure): AnyProcedure {
  return { ...procedure, metadata: { ...procedure.metadata, fsRoot: REFUSED_UNDER_A_ROOT } };
}

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
    pnpmExecProcedure,
    pnpmListProcedure,
    pnpmWhyProcedure,
    pnpmOutdatedProcedure,
    pnpmUpdateProcedure,
    pnpmPackProcedure,
  ].map(underARoot), [shellModule]);

export default pnpmModule;

/**
 * This function registers the procedures of @procedures/pnpm, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerPnpmProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [pnpmModule]);
}
