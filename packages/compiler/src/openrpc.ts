/**
 * An OpenRPC document from a manifest (roadmap R23).
 *
 * The manifest of a host (`describeRegistry()`, `procedure.manifest`, roadmap R17) has the JSON
 * Schemas of each procedure. This module writes them as an OpenRPC 1.3 document: one method for
 * each procedure. A tool of the OpenRPC ecosystem can then show the procedures or make a client.
 *
 * The keys of each object have a fixed order, and the methods are in the order of their names.
 * Thus one manifest always gives the same text, and a golden file can hold it.
 */

import type { Effects, ProcedureManifest, ProcedurePath } from "@procedures/client/browser";

/** The version of the OpenRPC specification of the documents. */
export const OPENRPC_VERSION = "1.3.2";

/** A content descriptor of OpenRPC: a name and a JSON Schema. */
export interface OpenRpcContentDescriptor {
  readonly name: string;
  readonly required?: boolean | undefined;
  readonly schema: Record<string, unknown>;
}

/** One method of an OpenRPC document: one procedure. */
export interface OpenRpcMethod {
  /** The key of the procedure: its path with dots. */
  readonly name: string;
  readonly description?: string | undefined;
  readonly tags?: ReadonlyArray<{ readonly name: string }> | undefined;
  readonly params: readonly [OpenRpcContentDescriptor];
  readonly result: OpenRpcContentDescriptor;
  readonly deprecated?: boolean | undefined;
  /** The path of the procedure. A segment can have a dot, so the name alone does not give the path. */
  readonly "x-path": ProcedurePath;
  /** The declared effects of the procedure. Absent: the procedure does not declare its effects. */
  readonly "x-effects"?: Effects | undefined;
  /** True: the procedure operates its input as a program (control flow, a defined procedure). */
  readonly "x-data-driven"?: boolean | undefined;
}

/** An OpenRPC 1.3 document. */
export interface OpenRpcDocument {
  readonly openrpc: string;
  readonly info: { readonly title: string; readonly version: string; readonly description?: string | undefined };
  readonly methods: OpenRpcMethod[];
}

/** The options of `toOpenRpc()`. */
export interface OpenRpcOptions {
  /** The title of the document. The default is "Procedures". */
  readonly title?: string | undefined;
  /** The version of the document. The default is the hash of the manifest. */
  readonly version?: string | undefined;
  /** The description of the document. */
  readonly description?: string | undefined;
}

/** A copy of a JSON value: only JSON values, and no `undefined`. */
function jsonCopy(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const copy = JSON.parse(JSON.stringify(value)) as unknown;
  return copy !== null && typeof copy === "object" && !Array.isArray(copy) ? (copy as Record<string, unknown>) : {};
}

/** The effects with their keys in a fixed order. */
function effectsCopy(effects: Effects): Effects {
  return {
    ...(effects.reads ? { reads: [...effects.reads] } : {}),
    ...(effects.writes ? { writes: [...effects.writes] } : {}),
    ...(effects.destructive !== undefined ? { destructive: effects.destructive } : {}),
    ...(effects.idempotent !== undefined ? { idempotent: effects.idempotent } : {}),
  };
}

/**
 * This function writes a manifest as an OpenRPC 1.3 document. Each procedure is a method with
 * its key as the name. The input schema is the one parameter `input`. The output schema is the
 * result `output`. The declared effects are the extension `x-effects`.
 */
export function toOpenRpc(manifest: ProcedureManifest, options: OpenRpcOptions = {}): OpenRpcDocument {
  const entries = [...manifest.procedures].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const methods = entries.map(
    (entry): OpenRpcMethod => ({
      name: entry.key,
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      ...(entry.tags && entry.tags.length > 0 ? { tags: entry.tags.map((name) => ({ name })) } : {}),
      params: [{ name: "input", required: true, schema: jsonCopy(entry.input) }],
      result: { name: "output", schema: jsonCopy(entry.output) },
      ...(entry.deprecated ? { deprecated: true } : {}),
      "x-path": [...entry.path],
      ...(entry.effects ? { "x-effects": effectsCopy(entry.effects) } : {}),
      ...(entry.dataDriven ? { "x-data-driven": true } : {}),
    }),
  );
  return {
    openrpc: OPENRPC_VERSION,
    info: {
      title: options.title ?? "Procedures",
      version: options.version ?? manifest.hash,
      ...(options.description !== undefined ? { description: options.description } : {}),
    },
    methods,
  };
}
