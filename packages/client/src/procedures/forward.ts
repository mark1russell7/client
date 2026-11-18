/**
 * The procedures of a running peer, forwarded (d40-tool-surface, step 2).
 *
 * A peer with a state, for example a daemon, keeps its procedures in its own process. A host does
 * not load a second copy of them. It reads the manifest of the peer, and it makes a stub for each
 * entry. The handler of a stub sends the call to the peer. The peer examines the input with its own
 * schemas and applies its own policy. The stub gives the JSON Schemas of the entry to a tool list,
 * and the declared effects of the entry to the policy of the host.
 */

import { pathToKey, type AnyProcedure, type ProcedureContext, type ProcedureModule, type ProcedurePath } from "./types.js";
import type { JsonSchema, JsonSchemaSource, StandardSchemaV1 } from "./schema.js";
import type { ProcedureEntry, ProcedureManifest } from "./manifest.js";

/**
 * The namespaces of each host: a forwarded module leaves them out, unless `namespaces` names them.
 * The handles of a host are its own (`handle`, d40-handles), so a peer does not forward them.
 */
export const HOST_NAMESPACES: readonly string[] = Object.freeze(["client", "procedure", "handle"]);

/** The function that sends one call to the peer and gives its result: the last item of a stream. */
export type ForwardCall = (path: ProcedurePath, input: unknown, signal: AbortSignal | undefined) => Promise<unknown>;

/** The options of `forwardedModule`. */
export interface ForwardOptions {
  /** The name of the module. */
  readonly name: string;
  /** The namespaces to forward. The default is each namespace of the manifest except `HOST_NAMESPACES`. */
  readonly namespaces?: readonly string[] | undefined;
  /** A path in front of each local path. With `["peer"]`, the entry `jobs.list` becomes `peer.jobs.list` here. */
  readonly prefix?: ProcedurePath | undefined;
}

/** A schema that accepts each value: the peer examines the value. Its JSON Schema is the schema of the entry. */
function forwardedSchema(json: JsonSchema | undefined): StandardSchemaV1 & JsonSchemaSource {
  return {
    "~standard": { version: 1, vendor: "procedures-forward", validate: (value: unknown) => ({ value }) },
    ...(json ? { "~jsonSchema": json } : {}),
  };
}

/** This function tells if the module forwards an entry. */
function forwards(entry: ProcedureEntry, namespaces: readonly string[] | undefined): boolean {
  // A stream without an end has no last item, so a call of it does not end
  if (entry.unboundedStream === true || !entry.hasHandler) return false;
  const namespace = entry.path[0] ?? "";
  return namespaces ? namespaces.includes(namespace) : !HOST_NAMESPACES.includes(namespace);
}

/** The stub of one entry. Its handler sends the call to the path of the entry on the peer. */
function stubOf(entry: ProcedureEntry, call: ForwardCall, prefix: ProcedurePath): AnyProcedure {
  const remote = [...entry.path];
  return {
    path: [...prefix, ...remote],
    input: forwardedSchema(entry.input),
    output: forwardedSchema(entry.output),
    metadata: {
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      ...(entry.tags !== undefined ? { tags: [...entry.tags] } : {}),
      ...(entry.effects !== undefined ? { effects: entry.effects } : {}),
      ...(entry.deprecated === true ? { deprecated: true } : {}),
      ...(entry.cli ?? {}),
      forwarded: pathToKey(remote),
    },
    handler: (input: unknown, ctx?: ProcedureContext) => call(remote, input, ctx?.signal),
  } as AnyProcedure;
}

/**
 * This function makes a module of stubs from the manifest of a peer. A stub has the description, the
 * schemas, the effects and the command-line metadata of its entry. Its metadata `forwarded` gives the
 * key of the entry on the peer. The module leaves out each stream without an end and each entry
 * without a handler.
 */
export function forwardedModule(manifest: ProcedureManifest, call: ForwardCall, options: ForwardOptions): ProcedureModule {
  const prefix = [...(options.prefix ?? [])];
  return {
    name: options.name,
    procedures: manifest.procedures.filter((entry) => forwards(entry, options.namespaces)).map((entry) => stubOf(entry, call, prefix)),
  };
}
