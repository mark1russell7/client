/**
 * The loader of an exports manifest: a procedure module from the manifest and the functions of
 * the package. The module works in a browser.
 */

import * as z from "zod";
import { defineModule, defineProcedure, type AnyProcedure, type ProcedureModule } from "@procedures/client/browser";
import type { ExportProcedure, ExportsJsonSchema, ExportsManifest } from "./types.js";
import { EXPORTS_MANIFEST_FORMAT } from "./types.js";

/** The options of `exportsModule()`. */
export interface ExportsModuleOptions {
  /** The name of the module. The default is the package of the manifest, with its entry. */
  readonly name?: string;
}

/**
 * This function gives a procedure module from an exports manifest and the functions of its
 * package, for example `exportsModule(manifest, await import("@mark1russell7/rigor-statistics"))`.
 * Each procedure gives the properties of its input to its function in the order of `params`.
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
  const missing = manifest.procedures.filter((procedure) => typeof functions[procedure.name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `The package ${manifest.package} does not export the functions ${missing.map((procedure) => procedure.name).join(", ")} of its manifest`,
    );
  }
  const procedures: AnyProcedure[] = manifest.procedures.map((procedure) =>
    procedureOf(procedure, functions[procedure.name] as (...args: unknown[]) => unknown, manifest.$defs),
  );
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

function procedureOf(
  procedure: ExportProcedure,
  fn: (...args: unknown[]) => unknown,
  defs: ExportsManifest["$defs"],
): AnyProcedure {
  const input = z.fromJSONSchema(withDefinitions(procedure.input, defs) as never);
  const output = z.fromJSONSchema(withDefinitions(procedure.output, defs) as never);
  return defineProcedure({
    path: [...procedure.path],
    input,
    output,
    metadata: {
      ...(procedure.description !== undefined ? { description: procedure.description } : {}),
      ...(procedure.effects !== undefined ? { effects: procedure.effects } : {}),
    },
    handler: async (value: unknown) => {
      const record = (value ?? {}) as Record<string, unknown>;
      const args = procedure.params.map((name) => record[name]);
      // Trailing absent arguments stay absent, so a default parameter applies
      while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
      if (procedure.rest !== undefined) {
        const rest = record[procedure.rest];
        if (Array.isArray(rest)) args.push(...(rest as unknown[]));
      }
      return jsonValue(await fn(...args));
    },
  }) as AnyProcedure;
}

/**
 * The value as JSON gives it, so a call in process gives the output of a call over HTTP. An
 * absent value and an undefined item of an array become null. A property with an undefined value
 * is absent. This function copies only the arrays and objects that change.
 */
export function jsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    let copy: unknown[] | undefined;
    for (const [index, item] of value.entries()) {
      const json = jsonValue(item);
      if (json !== item) (copy ??= [...value])[index] = json;
    }
    return copy ?? value;
  }
  if (value === null || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return value;
  let copy: Record<string, unknown> | undefined;
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) {
      copy ??= { ...value };
      delete copy[key];
      continue;
    }
    const json = jsonValue(item);
    if (json !== item) (copy ??= { ...value })[key] = json;
  }
  return copy ?? value;
}

/** The schema with a `$defs` of each definition that it reaches, so the schema stands alone. */
function withDefinitions(schema: ExportsJsonSchema, defs: ExportsManifest["$defs"]): ExportsJsonSchema {
  const reached = new Map<string, ExportsJsonSchema>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) {
        const name = value.slice("#/$defs/".length);
        const definition = defs[name];
        if (definition === undefined) throw new Error(`The schema refers to the definition ${name}, which the manifest does not have`);
        if (!reached.has(name)) {
          reached.set(name, definition);
          visit(definition);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(schema);
  if (reached.size === 0) return schema;
  return { ...schema, $defs: Object.fromEntries(reached) };
}
