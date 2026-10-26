/**
 * The procedures of @procedures/compiler as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/compiler
 */

import {
  definePackage,
  createProcedure,
  RAW_INPUT_TAG,
  REGISTRY_READ_EFFECTS,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedureModule,
  type PackageDefinition,
} from "@procedures/client/browser";
import { programCheck } from "./procedures/program/check.js";
import { programCompile } from "./procedures/program/compile.js";
import { programDiagram } from "./procedures/program/diagram.js";
import { programExplain } from "./procedures/program/explain.js";
import { sdkOpenrpc } from "./procedures/sdk/openrpc.js";
import { sdkTypescript } from "./procedures/sdk/typescript.js";
import {
  ProgramCheckInputSchema,
  ProgramCheckOutputSchema,
  ProgramCompileInputSchema,
  ProgramCompileOutputSchema,
  ProgramDiagramInputSchema,
  ProgramDiagramOutputSchema,
  ProgramExplainInputSchema,
  ProgramExplainOutputSchema,
  SdkOpenrpcInputSchema,
  SdkOpenrpcOutputSchema,
  SdkTypescriptInputSchema,
  SdkTypescriptOutputSchema,
  type ProgramCheckInput,
  type ProgramCheckOutput,
  type ProgramCompileInput,
  type ProgramCompileOutput,
  type ProgramDiagramInput,
  type ProgramDiagramOutput,
  type ProgramExplainInput,
  type ProgramExplainOutput,
  type SdkOpenrpcInput,
  type SdkOpenrpcOutput,
  type SdkTypescriptInput,
  type SdkTypescriptOutput,
} from "./types.js";

// The program is data for these procedures: the raw-input tag keeps hydration from starting it.
// They read the registry and change nothing.
const programCheckProcedure = createProcedure()
  .path(["program", "check"])
  .input(ProgramCheckInputSchema)
  .output(ProgramCheckOutputSchema)
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
  .input(ProgramCompileInputSchema)
  .output(ProgramCompileOutputSchema)
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

const programDiagramProcedure = createProcedure()
  .path(["program", "diagram"])
  .input(ProgramDiagramInputSchema)
  .output(ProgramDiagramOutputSchema)
  .meta({
    description: "Draw a program as a Mermaid flowchart: the order of the calls, the control flow and the names",
    tags: ["compiler", RAW_INPUT_TAG],
    effects: REGISTRY_READ_EFFECTS,
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ProgramDiagramInput, ctx: ProcedureContext): Promise<ProgramDiagramOutput> => programDiagram(input, ctx))
  .build();

const programExplainProcedure = createProcedure()
  .path(["program", "explain"])
  .input(ProgramExplainInputSchema)
  .output(ProgramExplainOutputSchema)
  .meta({
    description: "Explain a program before it runs: its effects, each call with the answer of the capability, and the problems",
    tags: ["compiler", RAW_INPUT_TAG],
    effects: REGISTRY_READ_EFFECTS,
    args: [],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ProgramExplainInput, ctx: ProcedureContext): Promise<ProgramExplainOutput> => programExplain(input, ctx))
  .build();

// The SDK procedures read the manifest of the caller's registry, as procedure.manifest does.
// The namespace sdk is not a tool namespace of the MCP server.
const sdkOpenrpcProcedure = createProcedure()
  .path(["sdk", "openrpc"])
  .input(SdkOpenrpcInputSchema)
  .output(SdkOpenrpcOutputSchema)
  .meta({
    description: "Describe the exposed procedures as an OpenRPC 1.3 document",
    tags: ["compiler", "sdk"],
    effects: REGISTRY_READ_EFFECTS,
    args: [],
    shorts: { namespace: "n" },
    output: "json",
  })
  .handler(async (input: SdkOpenrpcInput, ctx: ProcedureContext): Promise<SdkOpenrpcOutput> => sdkOpenrpc(input, ctx))
  .build();

const sdkTypescriptProcedure = createProcedure()
  .path(["sdk", "typescript"])
  .input(SdkTypescriptInputSchema)
  .output(SdkTypescriptOutputSchema)
  .meta({
    description: "Write a typed TypeScript SDK for the exposed procedures",
    tags: ["compiler", "sdk"],
    effects: REGISTRY_READ_EFFECTS,
    args: [],
    shorts: { namespace: "n" },
    output: "json",
  })
  .handler(async (input: SdkTypescriptInput, ctx: ProcedureContext): Promise<SdkTypescriptOutput> => sdkTypescript(input, ctx))
  .build();

const compilerPackage: PackageDefinition = definePackage("@procedures/compiler", [
  programCheckProcedure as AnyProcedure,
  programCompileProcedure as AnyProcedure,
  programDiagramProcedure as AnyProcedure,
  programExplainProcedure as AnyProcedure,
  sdkOpenrpcProcedure as AnyProcedure,
  sdkTypescriptProcedure as AnyProcedure,
]);

/**
 * The module of this package, for `createRegistry()`: `program.check`, `program.compile`,
 * `program.diagram`, `program.explain`, `sdk.openrpc` and `sdk.typescript`.
 */
export const compilerModule: ProcedureModule = compilerPackage.module;

/** The same module under the name of its namespace. */
export const programModule: ProcedureModule = compilerModule;

export default compilerModule;

/**
 * This function registers the procedures of @procedures/compiler in a registry. The default is the
 * global registry.
 */
export const registerCompilerProcedures: PackageDefinition["register"] = compilerPackage.register;
