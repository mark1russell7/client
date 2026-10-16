/**
 * One manifest type (roadmap R17).
 *
 * Before, ten systems described procedures, with three manifest formats, three version schemes
 * and no shared type: `procedure.get` gave booleans for the schemas, `manifest.generate` gave
 * JSON Schemas but no effects, `_discovery.announce` gave no schemas, the MCP tool list gave the
 * effects as hints, and none of them obeyed the expose rule of the host. This module is the one
 * description: a function of a procedure, and a function of a registry with the expose rule.
 * The introspection procedures, the compiler (R20) and the SDK generators read it.
 */

import { pathToKey, type AnyProcedure, type Effects, type ProcedurePath } from "./types.js";
import { jsonSchemaOf, type JsonSchema } from "./schema.js";
import { isDataDriven } from "./ref.js";
import { isRuntimeDefined } from "./runtime-programs.js";

/** The format of a manifest. A change that is not compatible makes a new format. */
export const MANIFEST_FORMAT = "procedures.manifest/1";

/** The command-line metadata of a procedure: how `mark` reads its arguments and prints its result. */
export interface CliDescription {
  readonly args?: readonly string[] | undefined;
  readonly shorts?: Readonly<Record<string, string>> | undefined;
  readonly output?: string | undefined;
  readonly interactive?: boolean | undefined;
}

/** The description of one procedure. */
export interface ProcedureEntry {
  readonly path: ProcedurePath;
  readonly key: string;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  /** The declared effects. Absent: not declared. */
  readonly effects?: Effects | undefined;
  /** The JSON Schema of the input (draft-07). */
  readonly input?: JsonSchema | undefined;
  /** The JSON Schema of the output (draft-07). */
  readonly output?: JsonSchema | undefined;
  /** The procedures that a procedure of code calls (`metadata.calls`). */
  readonly calls?: readonly string[] | undefined;
  /** True: the stream of the procedure can run without an end (R15). */
  readonly unboundedStream?: boolean | undefined;
  /** True: the procedure runs its input as a program (control flow, a defined procedure). */
  readonly dataDriven: boolean;
  /** True: `procedure.define` made it at run time. */
  readonly runtime: boolean;
  /** True: the procedure has a handler, so it can run here. */
  readonly hasHandler: boolean;
  readonly deprecated?: boolean | undefined;
  readonly cli?: CliDescription | undefined;
}

/** The description of the procedures of a registry. */
export interface ProcedureManifest {
  readonly format: typeof MANIFEST_FORMAT;
  /** A hash of the entries: two manifests with the same hash describe the same procedures. */
  readonly hash: string;
  readonly procedures: readonly ProcedureEntry[];
}

/** The options of `describeProcedure` and `describeRegistry`. */
export interface DescribeOptions {
  /** False leaves out the JSON Schemas. The default is true. */
  readonly schemas?: boolean | undefined;
}

/** The options of `describeRegistry`. */
export interface DescribeRegistryOptions extends DescribeOptions {
  /** The expose rule of the host: a procedure outside it is not in the manifest. */
  readonly expose?: ((path: ProcedurePath) => boolean) | undefined;
  /** More filtering: a procedure for which it gives false is not in the manifest. */
  readonly include?: ((procedure: AnyProcedure) => boolean) | undefined;
  /** True keeps the procedures without a handler (stubs of a remote host). The default is false. */
  readonly withoutHandler?: boolean | undefined;
}

/** This function describes one procedure. */
export function describeProcedure(procedure: AnyProcedure, options: DescribeOptions = {}): ProcedureEntry {
  const meta = (procedure.metadata ?? {}) as Record<string, unknown>;
  const schemas = options.schemas !== false;
  const effects = meta["effects"];
  const calls = meta["calls"];
  const cli: CliDescription = {
    ...(Array.isArray(meta["args"]) ? { args: meta["args"] as string[] } : {}),
    ...(meta["shorts"] && typeof meta["shorts"] === "object" ? { shorts: meta["shorts"] as Record<string, string> } : {}),
    ...(typeof meta["output"] === "string" ? { output: meta["output"] } : {}),
    ...(typeof meta["interactive"] === "boolean" ? { interactive: meta["interactive"] } : {}),
  };
  const input = schemas ? jsonSchemaOf(procedure.input, { io: "input" }) : undefined;
  const output = schemas ? jsonSchemaOf(procedure.output, { io: "output" }) : undefined;
  return {
    path: procedure.path,
    key: pathToKey(procedure.path),
    ...(typeof meta["description"] === "string" ? { description: meta["description"] } : {}),
    ...(Array.isArray(meta["tags"]) ? { tags: meta["tags"] as string[] } : {}),
    ...(effects && typeof effects === "object" ? { effects: effects as Effects } : {}),
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
    ...(Array.isArray(calls) ? { calls: calls as string[] } : {}),
    ...((meta["stream"] as { unbounded?: unknown } | undefined)?.unbounded === true ? { unboundedStream: true } : {}),
    dataDriven: isDataDriven(procedure),
    runtime: isRuntimeDefined(procedure),
    hasHandler: typeof procedure.handler === "function",
    ...(meta["deprecated"] === true ? { deprecated: true } : {}),
    ...(Object.keys(cli).length > 0 ? { cli } : {}),
  };
}

/** The procedures of a registry, as the expose rule of the host shows them. */
export function exposedProcedures(
  registry: { getAll(): AnyProcedure[] },
  options: Pick<DescribeRegistryOptions, "expose" | "include" | "withoutHandler"> = {},
): AnyProcedure[] {
  return registry
    .getAll()
    .filter(
      (procedure) =>
        (options.withoutHandler === true || typeof procedure.handler === "function") &&
        (!options.expose || options.expose(procedure.path)) &&
        (!options.include || options.include(procedure)),
    );
}

/**
 * This function describes the procedures of a registry that the expose rule shows, in the order
 * of their keys, with a hash of the description.
 */
export function describeRegistry(registry: { getAll(): AnyProcedure[] }, options: DescribeRegistryOptions = {}): ProcedureManifest {
  const procedures = exposedProcedures(registry, options)
    .map((procedure) => describeProcedure(procedure, options))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { format: MANIFEST_FORMAT, hash: hashOf(procedures), procedures };
}

/** A stable JSON text: the keys of each object in order. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

/** A 64-bit FNV-1a hash of the stable JSON of a value, as 16 hex digits. */
export function hashOf(value: unknown): string {
  const text = stableJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < text.length; index++) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}
