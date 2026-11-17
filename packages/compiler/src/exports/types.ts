/**
 * The exports manifest: the procedures of a package as data, made from its typed exports.
 *
 * The generator (`@procedures/compiler/generate`) reads the declaration files of a package and
 * writes this manifest. The loader (`exportsModule()`) gives a procedure module from the manifest
 * and the functions of the package. Nobody writes a wrapper by hand, so a wrapper cannot drift
 * from its package (direction 40).
 */

import type { Effects } from "@procedures/client/browser";

/** The format name of the manifest. A change that breaks a reader gives a new number. */
export const EXPORTS_MANIFEST_FORMAT = "procedures-exports/1" as const;

/** A JSON Schema (draft 2020-12). */
export type ExportsJsonSchema = Record<string, unknown>;

/** The manifest of the procedures of one entry of a package. */
export interface ExportsManifest {
  readonly format: typeof EXPORTS_MANIFEST_FORMAT;
  /** The npm name of the package, for example `@mark1russell7/rigor-statistics`. */
  readonly package: string;
  /** The version of the package that the generator read. */
  readonly version?: string;
  /** The entry of the package, for example `.` or `./geometry`. */
  readonly entry: string;
  /** The first segments of the path of each procedure, for example `["statistics"]`. */
  readonly namespace: readonly string[];
  /** The named types that the schemas refer to with `{ "$ref": "#/$defs/<name>" }`. */
  readonly $defs: Readonly<Record<string, ExportsJsonSchema>>;
  /** One entry for each public function that has a procedure. */
  readonly procedures: readonly ExportProcedure[];
  /** One entry for each public function that has no procedure, with its reason. */
  readonly exempt: readonly ExportExemption[];
  /** The counts of the public names that are not functions. */
  readonly others: ExportOthers;
}

/** The procedure of one public function. */
export interface ExportProcedure {
  /** The name of the export. */
  readonly name: string;
  /** The path of the procedure: the namespace and the name. */
  readonly path: readonly string[];
  /** The first paragraph of the doc comment of the function. */
  readonly description?: string;
  /**
   * The names of the parameters, in order. The input is an object with one property for each
   * name. The handler gives the properties to the function in this order.
   */
  readonly params: readonly string[];
  /** The name of a rest parameter. Its property is an array, and the handler spreads it. */
  readonly rest?: string;
  /** The JSON Schema of the input object. */
  readonly input: ExportsJsonSchema;
  /** The JSON Schema of the output. A function that gives nothing has the output `null`. */
  readonly output: ExportsJsonSchema;
  /** True when the function gives a promise. */
  readonly async?: true;
  /** The effects of the call. Absent means unknown: a check with a capability fails closed. */
  readonly effects?: Effects;
  /** The type parameters that the schemas read as a JSON value, or as their constraint. */
  readonly generics?: readonly string[];
}

/** The reasons why a public function has no procedure. */
export type ExportExemptionReason =
  /** A parameter is a function: a declarative program gives it as a call (d40-language-ops). */
  | "function-parameter"
  /** An input is not JSON, for example a `Map`, a `bigint` or a class instance. */
  | "input-not-json"
  /** The output is not JSON, for example a class instance: a handle (d40-handles). */
  | "output-not-json"
  /** The function has more than one signature. */
  | "overload"
  /** The overlay of the package exempts it, with a reason in `detail`. */
  | "overlay"
  /** A re-export does not resolve, for example because its module is not installed. */
  | "unresolved";

/** A public function with no procedure. */
export interface ExportExemption {
  readonly name: string;
  readonly reason: ExportExemptionReason;
  /** The type or the part of the signature that decided, for example `statistic: (sample) => number`. */
  readonly detail: string;
}

/** The counts of the public names that are not functions. */
export interface ExportOthers {
  /** The classes: each one is a candidate for a handle (d40-handles). */
  readonly classes: readonly string[];
  /** The constants. */
  readonly values: number;
  /** The types and the interfaces. */
  readonly types: number;
}
