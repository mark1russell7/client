/**
 * The procedures of @procedures/compiler as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/compiler
 */

import {
  createProcedure,
  defineModule,
  registerModules,
  zodAdapter,
  PROCEDURE_REGISTRY,
  RAW_INPUT_TAG,
  REGISTRY_READ_EFFECTS,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client/browser";
import { programCheck } from "./procedures/program/check.js";
import { programCompile } from "./procedures/program/compile.js";
import {
  ProgramCheckInputSchema,
  ProgramCheckOutputSchema,
  ProgramCompileInputSchema,
  ProgramCompileOutputSchema,
  type ProgramCheckInput,
  type ProgramCheckOutput,
  type ProgramCompileInput,
  type ProgramCompileOutput,
} from "./types.js";

// The program is data for these procedures: the raw-input tag keeps hydration from starting it.
// They read the registry and change nothing.
const programCheckProcedure = createProcedure()
  .path(["program", "check"])
  .input(zodAdapter<ProgramCheckInput>(ProgramCheckInputSchema))
  .output(zodAdapter<ProgramCheckOutput>(ProgramCheckOutputSchema))
  .meta({
    description: "Check a program before it runs: names, procedures, inputs, the capability and the effects",
    tags: ["compiler", RAW_INPUT_TAG],
    effects: REGISTRY_READ_EFFECTS,
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ProgramCheckInput, ctx: ProcedureContext): Promise<ProgramCheckOutput> => programCheck(input, ctx))
  .build();

const programCompileProcedure = createProcedure()
  .path(["program", "compile"])
  .input(zodAdapter<ProgramCompileInput>(ProgramCompileInputSchema))
  .output(zodAdapter<ProgramCompileOutput>(ProgramCompileOutputSchema))
  .meta({
    description: "Compile a program to a JavaScript function that makes the same calls in the same order",
    tags: ["compiler", RAW_INPUT_TAG],
    effects: REGISTRY_READ_EFFECTS,
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ProgramCompileInput, ctx: ProcedureContext): Promise<ProgramCompileOutput> => programCompile(input, ctx))
  .build();

/** The module of this package, for `createRegistry()`: `program.check` and `program.compile`. */
export const compilerModule: ProcedureModule = defineModule("@procedures/compiler", [
  programCheckProcedure as AnyProcedure,
  programCompileProcedure as AnyProcedure,
]);

/** The same module under the name of its namespace. */
export const programModule: ProcedureModule = compilerModule;

export default compilerModule;

/**
 * This function registers the procedures of @procedures/compiler in a registry. The default is the
 * global registry.
 */
export function registerCompilerProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [compilerModule]);
}
