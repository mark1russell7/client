/**
 * The loader of an exports manifest: a procedure module from the manifest and the functions of
 * the package. The module works in a browser.
 */

import * as z from "zod";
import {
  closeValue,
  defineModule,
  defineProcedure,
  handleModule,
  handleScopeOf,
  type AnyProcedure,
  type Effects,
  type ProcedureContext,
  type ProcedureModule,
} from "@procedures/client/browser";
import type { ExportProcedure, ExportsConstruct, ExportsJsonSchema, ExportsManifest } from "./types.js";
import { CONSTRUCT_KEYWORD, EXPORTS_MANIFEST_FORMAT } from "./types.js";
import { codecDecoder } from "./codecs.js";
import { withDefinitions } from "./definitions.js";
import { handleKindsOf } from "./handles.js";
import { jsonValue } from "./json.js";
import { reachesProgram, registerOperator, withSubPrograms } from "./programs.js";

export { jsonValue } from "./json.js";

/** The functions of a package: its module object, for example `await import("@mark1russell7/rational")`. */
export type ExportsFunctions = Readonly<Record<string, unknown>>;

/**
 * The functions of a package, or a function that loads them. A loader keeps a package and its
 * dependencies out of the process until the first call of one of its procedures.
 */
export type ExportsFunctionsSource = ExportsFunctions | (() => Promise<ExportsFunctions>);

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
 * codec, for example a bigint, comes from its JSON form (`./codecs.ts`). The object of a handle
 * input comes from the handle scope of the caller, and the object of a handle output goes into it
 * (`./handles.ts`). Then the module brings `handleModule`, for `handle.list` and `handle.close`.
 *
 * The function throws when the manifest names a function that the package does not export: then
 * the manifest is older or newer than the package.
 *
 * In place of the functions, the function takes a loader, for example
 * `() => import("@mark1russell7/sqlite")`. The first call of a procedure starts the loader one time,
 * and the check of the names occurs then. A failed load does not stay: the next call loads again.
 * A procedure of a loader is not an operator of a sub-program, because an operator gives its
 * value at once.
 */
export function exportsModule(manifest: ExportsManifest, functions: ExportsFunctionsSource, options: ExportsModuleOptions = {}): ProcedureModule {
  if (manifest.format !== EXPORTS_MANIFEST_FORMAT) {
    throw new Error(`The manifest has the format ${String(manifest.format)}: this loader reads ${EXPORTS_MANIFEST_FORMAT}`);
  }
  const named = new Set(manifest.procedures.flatMap((procedure) => [procedure.name, ...constructsOf(procedure).flatMap((construct) => (construct ? [construct.function] : []))]));
  const source = typeof functions === "function" ? loadOnce(functions, named, manifest.package) : checked(functions, named, manifest.package);
  const procedures: AnyProcedure[] = manifest.procedures.map((procedure) => procedureOf(procedure, source, manifest.$defs));
  const name = options.name ?? (manifest.entry === "." ? manifest.package : `${manifest.package}/${manifest.entry.replace(/^\.\//, "")}`);
  const handles = manifest.procedures.some((procedure) => usesHandles(procedure));
  return defineModule(name, procedures, handles ? [handleModule] : []);
}

/** The functions of a package, after the check that it exports each function of the manifest. */
function checked(functions: ExportsFunctions, named: ReadonlySet<string>, pkg: string): ExportsFunctions {
  const missing = [...named].filter((name) => typeof functions[name] !== "function");
  if (missing.length > 0) throw new Error(`The package ${pkg} does not export the functions ${missing.join(", ")} of its manifest`);
  return functions;
}

/**
 * This function gives a loader that loads the functions one time, and checks them. A failed load
 * does not stay, so the next call loads again.
 */
function loadOnce(load: () => Promise<ExportsFunctions>, named: ReadonlySet<string>, pkg: string): () => Promise<ExportsFunctions> {
  let loading: Promise<ExportsFunctions> | undefined;
  return () => {
    if (loading !== undefined) return loading;
    const current = load().then((functions) => checked(functions, named, pkg));
    loading = current;
    current.catch(() => {
      if (loading === current) loading = undefined;
    });
    return current;
  };
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

/** The function of a procedure, and the function that makes the value of each constructed input. */
interface Bound {
  readonly fn: PackageFunction;
  readonly makers: readonly (Maker | undefined)[];
}

function procedureOf(procedure: ExportProcedure, source: ExportsFunctions | (() => Promise<ExportsFunctions>), defs: ExportsManifest["$defs"]): AnyProcedure {
  const input = z.fromJSONSchema(withDefinitions(procedure.input, defs) as never);
  const output = z.fromJSONSchema(withDefinitions(procedure.output, defs) as never);
  const programs = reachesProgram(procedure.input, defs);
  // The function, and the function that makes the value of each parameter with a constructed input
  const bind = (functions: ExportsFunctions): Bound => ({
    fn: functions[procedure.name] as PackageFunction,
    makers: constructsOf(procedure).map((construct) =>
      construct === undefined ? undefined : { make: functions[construct.function] as PackageFunction, params: construct.params },
    ),
  });
  // A loader binds the functions at the first call
  const eager = typeof source === "function" ? undefined : bind(source);
  let bound = eager;
  // The decoded form of each codec of the input, for example a bigint for its decimal string
  const decode = codecDecoder(procedure.input, defs);
  const callWith = (functions: Bound, record: Record<string, unknown>): unknown =>
    functions.fn(...argumentsOf(procedure, decode === undefined ? record : (decode(record) as Record<string, unknown>), functions.makers));
  const call = async (record: Record<string, unknown>): Promise<unknown> => {
    bound ??= bind(await (source as () => Promise<ExportsFunctions>)());
    return callWith(bound, record);
  };
  // The kind of each handle input, and the kind of a handle output (d40-handles)
  const properties = (procedure.input["properties"] ?? {}) as Record<string, ExportsJsonSchema>;
  const handleInputs = Object.entries(properties).flatMap(([name, schema]) => {
    const kinds = handleKindsOf(schema);
    return kinds === undefined ? [] : [[name, kinds] as const];
  });
  // The kind of the object of an output is the kind of its class: one kind
  const outputKinds = handleKindsOf(procedure.output);
  if (outputKinds !== undefined && outputKinds.length !== 1) {
    throw new Error(`The output of ${procedure.name} has the handle kinds ${outputKinds.join(", ")}: an output has one kind`);
  }
  const handleOutput = outputKinds?.[0];
  const defined = defineProcedure({
    path: [...procedure.path],
    input,
    output,
    metadata: {
      ...(procedure.description !== undefined ? { description: procedure.description } : {}),
      ...(procedure.effects !== undefined ? { effects: procedure.effects } : {}),
      ...(procedure.fsRoot !== undefined ? { fsRoot: procedure.fsRoot } : {}),
    },
    handler: async (value: unknown, ctx?: ProcedureContext) => {
      let record = (value ?? {}) as Record<string, unknown>;
      if (programs) record = (await withSubPrograms(record, procedure.input, defs, procedure.path, ctx)) as Record<string, unknown>;
      if (handleInputs.length > 0) {
        const scope = handleScopeOf(ctx);
        record = { ...record };
        for (const [name, kinds] of handleInputs) {
          const ref = record[name];
          if (ref !== undefined && ref !== null) record[name] = scope.get(ref as { handle: string }, kinds);
        }
      }
      if (handleOutput === undefined) return jsonValue(await call(record));
      // The scope must exist before the call, so a call with no scope opens no object
      const scope = handleScopeOf(ctx);
      const made = await call(record);
      if (made === undefined || made === null) return null;
      try {
        return scope.open(handleOutput, made);
      } catch (error) {
        // The scope refused the object, so this call still owns it
        await closeValue(made);
        throw error;
      }
    },
  }) as AnyProcedure;
  // A sub-program calls a pure function that gives its value at once, and that takes no sub-program
  if (eager !== undefined && !programs && handleInputs.length === 0 && handleOutput === undefined && procedure.async !== true && isPure(procedure.effects)) {
    registerOperator(defined.handler as object, { path: procedure.path, input, call: (record) => jsonValue(callWith(eager, record)) });
  }
  return defined;
}

/** True when a procedure takes or gives a handle. */
function usesHandles(procedure: ExportProcedure): boolean {
  const properties = (procedure.input["properties"] ?? {}) as Record<string, ExportsJsonSchema>;
  return handleKindsOf(procedure.output) !== undefined || Object.values(properties).some((schema) => handleKindsOf(schema) !== undefined);
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
