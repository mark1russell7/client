/**
 * The loader of an exports manifest: a procedure module from the manifest and the functions of
 * the package. The module works in a browser.
 */

import * as z from "zod";
import { defineModule, defineProcedure, type AnyProcedure, type Effects, type ProcedureContext, type ProcedureModule } from "@procedures/client/browser";
import type { ExportProcedure, ExportsConstruct, ExportsJsonSchema, ExportsManifest } from "./types.js";
import { CONSTRUCT_KEYWORD, EXPORTS_MANIFEST_FORMAT } from "./types.js";
import { codecDecoder } from "./codecs.js";
import { withDefinitions } from "./definitions.js";
import { jsonValue } from "./json.js";
import { reachesProgram, registerOperator, withSubPrograms } from "./programs.js";

export { jsonValue } from "./json.js";

/** The options of `exportsModule()`. */
export interface ExportsModuleOptions {
  /** The name of the module. The default is the package of the manifest, with its entry. */
  readonly name?: string;
}

/**
 * This function gives a procedure module from an exports manifest and the functions of its
 * package, for example `exportsModule(manifest, await import("@mark1russell7/rigor-statistics"))`.
 * Each procedure gives the properties of its input to its function in the order of `params`.
 * A call at a sub-program position of the input becomes a function (`./programs.ts`). The value
 * of a constructed input comes from its function of the package, before each call. The value of a
 * codec, for example a bigint, comes from its JSON form (`./codecs.ts`).
 *
 * The function throws when the manifest names a function that the package does not export: then
 * the manifest is older or newer than the package.
 */
export function exportsModule(
  manifest: ExportsManifest,
  functions: Readonly<Record<string, unknown>>,
  options: ExportsModuleOptions = {},
): ProcedureModule {
  if (manifest.format !== EXPORTS_MANIFEST_FORMAT) {
    throw new Error(`The manifest has the format ${String(manifest.format)}: this loader reads ${EXPORTS_MANIFEST_FORMAT}`);
  }
  const named = new Set(manifest.procedures.flatMap((procedure) => [procedure.name, ...constructsOf(procedure).flatMap((construct) => (construct ? [construct.function] : []))]));
  const missing = [...named].filter((name) => typeof functions[name] !== "function");
  if (missing.length > 0) {
    throw new Error(`The package ${manifest.package} does not export the functions ${missing.join(", ")} of its manifest`);
  }
  const procedures: AnyProcedure[] = manifest.procedures.map((procedure) => procedureOf(procedure, functions, manifest.$defs));
  const name = options.name ?? (manifest.entry === "." ? manifest.package : `${manifest.package}/${manifest.entry.replace(/^\.\//, "")}`);
  return defineModule(name, procedures);
}

/** The JSON Schema of the input of a procedure, with the definitions that it refers to. */
export function exportInputSchema(manifest: ExportsManifest, procedure: ExportProcedure): ExportsJsonSchema {
  return withDefinitions(procedure.input, manifest.$defs);
}

/** The JSON Schema of the output of a procedure, with the definitions that it refers to. */
export function exportOutputSchema(manifest: ExportsManifest, procedure: ExportProcedure): ExportsJsonSchema {
  return withDefinitions(procedure.output, manifest.$defs);
}

/** A function of the package. */
type PackageFunction = (...args: unknown[]) => unknown;

function procedureOf(
  procedure: ExportProcedure,
  functions: Readonly<Record<string, unknown>>,
  defs: ExportsManifest["$defs"],
): AnyProcedure {
  const fn = functions[procedure.name] as PackageFunction;
  const input = z.fromJSONSchema(withDefinitions(procedure.input, defs) as never);
  const output = z.fromJSONSchema(withDefinitions(procedure.output, defs) as never);
  const programs = reachesProgram(procedure.input, defs);
  // The function that makes the value of each parameter with a constructed input
  const makers = constructsOf(procedure).map((construct) =>
    construct === undefined ? undefined : { make: functions[construct.function] as PackageFunction, params: construct.params },
  );
  // The decoded form of each codec of the input, for example a bigint for its decimal string
  const decode = codecDecoder(procedure.input, defs);
  const call = (record: Record<string, unknown>): unknown =>
    fn(...argumentsOf(procedure, decode === undefined ? record : (decode(record) as Record<string, unknown>), makers));
  const defined = defineProcedure({
    path: [...procedure.path],
    input,
    output,
    metadata: {
      ...(procedure.description !== undefined ? { description: procedure.description } : {}),
      ...(procedure.effects !== undefined ? { effects: procedure.effects } : {}),
    },
    handler: async (value: unknown, ctx?: ProcedureContext) => {
      let record = (value ?? {}) as Record<string, unknown>;
      if (programs) record = (await withSubPrograms(record, procedure.input, defs, procedure.path, ctx)) as Record<string, unknown>;
      return jsonValue(await call(record));
    },
  }) as AnyProcedure;
  // A sub-program calls a pure function that gives its value at once, and that takes no sub-program
  if (!programs && procedure.async !== true && isPure(procedure.effects)) {
    registerOperator(defined.handler as object, { path: procedure.path, input, call: (record) => jsonValue(call(record)) });
  }
  return defined;
}

/** The construct of each parameter, in the order of the parameters: undefined for a JSON input. */
function constructsOf(procedure: ExportProcedure): (ExportsConstruct | undefined)[] {
  const properties = (procedure.input["properties"] ?? {}) as Record<string, ExportsJsonSchema | undefined>;
  return procedure.params.map((name) => properties[name]?.[CONSTRUCT_KEYWORD] as ExportsConstruct | undefined);
}

/** The function that makes the value of a constructed input, and the names of its parameters. */
interface Maker {
  readonly make: PackageFunction;
  readonly params: readonly string[];
}

/**
 * The arguments of a function from the properties of its input, in the order of its parameters.
 * The value of a constructed input is the result of its maker. An absent value stays absent.
 */
function argumentsOf(procedure: ExportProcedure, record: Record<string, unknown>, makers: readonly (Maker | undefined)[]): unknown[] {
  const args = procedure.params.map((name, index) => {
    const value = record[name];
    const maker = makers[index];
    if (maker === undefined || value === undefined) return value;
    const given = value as Record<string, unknown>;
    return maker.make(...trimmed(maker.params.map((param) => given[param])));
  });
  const rest = procedure.rest !== undefined ? record[procedure.rest] : undefined;
  const spread = Array.isArray(rest) ? (rest as unknown[]) : [];
  // Trailing absent arguments stay absent, so a default parameter applies. Before a rest, they stay
  if (spread.length === 0) trimmed(args);
  args.push(...spread);
  return args;
}

/** The arguments with no trailing absent argument, so a default parameter applies. */
function trimmed(args: unknown[]): unknown[] {
  while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
  return args;
}

/** True when the effects read nothing and change nothing. */
function isPure(effects: Effects | undefined): boolean {
  return effects?.reads !== undefined && effects.reads.length === 0 && effects.writes !== undefined && effects.writes.length === 0;
}
