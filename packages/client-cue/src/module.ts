/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for cue operations
 *
 * Registers cue.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { definePackage, createProcedure, type FsRootRules, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import fsModule from "@procedures/fs/module";
import { cueInit } from "./procedures/cue/init.js";
import { cueAdd } from "./procedures/cue/add.js";
import { cueRemove } from "./procedures/cue/remove.js";
import { cueGenerate } from "./procedures/cue/generate.js";
import { cueValidate } from "./procedures/cue/validate.js";
import {
  CueInitInputSchema,
  CueAddInputSchema,
  CueRemoveInputSchema,
  CueGenerateInputSchema,
  CueValidateInputSchema,
  type CueInitInput,
  type CueInitOutput,
  type CueAddInput,
  type CueAddOutput,
  type CueRemoveInput,
  type CueRemoveOutput,
  type CueGenerateInput,
  type CueGenerateOutput,
  type CueValidateInput,
  type CueValidateOutput,
  CueInitOutputSchema,
  CueAddOutputSchema,
  CueRemoveOutputSchema,
  CueGenerateOutputSchema,
  CueValidateOutputSchema,
} from "./types.js";

/**
 * The rule of each cue procedure under a root of the files (roadmap R33): the folder of the
 * project (`cwd`) must be in the root, and without `cwd` it is the root. The files of the project
 * go through `fs.*`, so the root confines them too. The files of the installed cue package are
 * not paths of the call.
 */
const CUE_IN_A_ROOT: FsRootRules = { cwd: "cwd" };

// =============================================================================
// Procedure Definitions
// =============================================================================

const cueInitProcedure = createProcedure()
  .path(["cue", "init"])
  .input(CueInitInputSchema)
  .output(CueInitOutputSchema)
  .meta({
    description: "Initialize dependencies.json with a preset",
    calls: ["fs.exists", "fs.read", "fs.write", "fs.mkdir"],
    // With `force`, it overwrites dependencies.json. A second call writes the same preset again.
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
    fsRoot: CUE_IN_A_ROOT,
    args: [],
    shorts: { preset: "p", force: "f", cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueInitInput, ctx): Promise<CueInitOutput> => {
    return cueInit(input, ctx);
  })
  .build();

const cueAddProcedure = createProcedure()
  .path(["cue", "add"])
  .input(CueAddInputSchema)
  .output(CueAddOutputSchema)
  .meta({
    description: "Add a feature to dependencies.json",
    calls: ["fs.exists", "fs.read", "fs.write"],
    // It writes dependencies.json again with only `$schema` and `dependencies`. Other fields go.
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
    fsRoot: CUE_IN_A_ROOT,
    args: ["feature"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueAddInput, ctx): Promise<CueAddOutput> => {
    return cueAdd(input, ctx);
  })
  .build();

const cueRemoveProcedure = createProcedure()
  .path(["cue", "remove"])
  .input(CueRemoveInputSchema)
  .output(CueRemoveOutputSchema)
  .meta({
    description: "Remove a feature from dependencies.json",
    calls: ["fs.exists", "fs.read", "fs.write"],
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
    fsRoot: CUE_IN_A_ROOT,
    args: ["feature"],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueRemoveInput, ctx): Promise<CueRemoveOutput> => {
    return cueRemove(input, ctx);
  })
  .build();

const cueGenerateProcedure = createProcedure()
  .path(["cue", "generate"])
  .input(CueGenerateInputSchema)
  .output(CueGenerateOutputSchema)
  .meta({
    description: "Generate config files from dependencies.json",
    calls: ["fs.exists", "fs.read", "fs.write", "fs.mkdir"],
    // The cue program evaluates the CUE files of @mark1russell7/cue, not code of the project.
    // The procedure rewrites package.json, tsconfig.json and .gitignore.
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
    fsRoot: CUE_IN_A_ROOT,
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueGenerateInput, ctx): Promise<CueGenerateOutput> => {
    return cueGenerate(input, ctx);
  })
  .build();

const cueValidateProcedure = createProcedure()
  .path(["cue", "validate"])
  .input(CueValidateInputSchema)
  .output(CueValidateOutputSchema)
  .meta({
    description: "Validate dependencies.json",
    calls: ["fs.exists", "fs.read"],
    effects: { reads: ["fs"], writes: [] },
    fsRoot: CUE_IN_A_ROOT,
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: CueValidateInput, ctx): Promise<CueValidateOutput> => {
    return cueValidate(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

const cuePackage: PackageDefinition = definePackage("@procedures/cue", [
    cueInitProcedure,
    cueAddProcedure,
    cueRemoveProcedure,
    cueGenerateProcedure,
    cueValidateProcedure,
  ], [fsModule]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const cueModule: ProcedureModule = cuePackage.module;

export default cueModule;

/**
 * This function registers the procedures of @procedures/cue, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerCueProcedures: PackageDefinition["register"] = cuePackage.register;
