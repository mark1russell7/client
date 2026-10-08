/**
 * Procedure Registration for cue operations
 *
 * Registers cue.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { cueInit } from "./procedures/cue/init.js";
import { cueAdd } from "./procedures/cue/add.js";
import { cueRemove } from "./procedures/cue/remove.js";
import { cueGenerate } from "./procedures/cue/generate.js";
import { cueValidate } from "./procedures/cue/validate.js";
import { CueInitInputSchema, CueAddInputSchema, CueRemoveInputSchema, CueGenerateInputSchema, CueValidateInputSchema, } from "./types.js";
// =============================================================================
// Procedure Definitions
// =============================================================================
const cueInitProcedure = createProcedure()
    .path(["cue", "init"])
    .input(zodAdapter(CueInitInputSchema))
    .output(outputSchema())
    .meta({
    description: "Initialize dependencies.json with a preset",
    args: [],
    shorts: { preset: "p", force: "f", cwd: "C" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return cueInit(input, ctx);
})
    .build();
const cueAddProcedure = createProcedure()
    .path(["cue", "add"])
    .input(zodAdapter(CueAddInputSchema))
    .output(outputSchema())
    .meta({
    description: "Add a feature to dependencies.json",
    args: ["feature"],
    shorts: { cwd: "C" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return cueAdd(input, ctx);
})
    .build();
const cueRemoveProcedure = createProcedure()
    .path(["cue", "remove"])
    .input(zodAdapter(CueRemoveInputSchema))
    .output(outputSchema())
    .meta({
    description: "Remove a feature from dependencies.json",
    args: ["feature"],
    shorts: { cwd: "C" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return cueRemove(input, ctx);
})
    .build();
const cueGenerateProcedure = createProcedure()
    .path(["cue", "generate"])
    .input(zodAdapter(CueGenerateInputSchema))
    .output(outputSchema())
    .meta({
    description: "Generate config files from dependencies.json",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return cueGenerate(input, ctx);
})
    .build();
const cueValidateProcedure = createProcedure()
    .path(["cue", "validate"])
    .input(zodAdapter(CueValidateInputSchema))
    .output(outputSchema())
    .meta({
    description: "Validate dependencies.json",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return cueValidate(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerCueProcedures() {
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
//# sourceMappingURL=register.js.map