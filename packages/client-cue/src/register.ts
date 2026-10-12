/**
 * Procedure Registration for cue operations
 *
 * Registers cue.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures, zodAdapter } from "@mark1russell7/client";
// The cue procedures read and write files through fs.*: register them wherever cue.* runs.
// (Over the MCP server, fs.* was not registered, so every cue tool failed: deep dive WRP-3.)
import "@mark1russell7/client-fs";
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

// =============================================================================
// Procedure Definitions
// =============================================================================

const cueInitProcedure = createProcedure()
  .path(["cue", "init"])
  .input(zodAdapter<CueInitInput>(CueInitInputSchema))
  .output(zodAdapter<CueInitOutput>(CueInitOutputSchema))
  .meta({
    description: "Initialize dependencies.json with a preset",
    calls: ["fs.exists", "fs.read", "fs.write", "fs.mkdir"],
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
  .input(zodAdapter<CueAddInput>(CueAddInputSchema))
  .output(zodAdapter<CueAddOutput>(CueAddOutputSchema))
  .meta({
    description: "Add a feature to dependencies.json",
    calls: ["fs.exists", "fs.read", "fs.write"],
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
  .input(zodAdapter<CueRemoveInput>(CueRemoveInputSchema))
  .output(zodAdapter<CueRemoveOutput>(CueRemoveOutputSchema))
  .meta({
    description: "Remove a feature from dependencies.json",
    calls: ["fs.exists", "fs.read", "fs.write"],
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
  .input(zodAdapter<CueGenerateInput>(CueGenerateInputSchema))
  .output(zodAdapter<CueGenerateOutput>(CueGenerateOutputSchema))
  .meta({
    description: "Generate config files from dependencies.json",
    calls: ["fs.exists", "fs.read", "fs.write", "fs.mkdir"],
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
  .input(zodAdapter<CueValidateInput>(CueValidateInputSchema))
  .output(zodAdapter<CueValidateOutput>(CueValidateOutputSchema))
  .meta({
    description: "Validate dependencies.json",
    calls: ["fs.exists", "fs.read"],
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

export function registerCueProcedures(): void {
  registerProcedures([
    cueInitProcedure,
    cueAddProcedure,
    cueRemoveProcedure,
    cueGenerateProcedure,
    cueValidateProcedure,
  ]);
}

// Auto-register when this module is loaded
registerCueProcedures();
