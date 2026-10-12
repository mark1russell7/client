/**
 * The schemas of procedures: Standard Schema v1, validation and JSON Schema.
 *
 * A procedure's input and output schema is a Standard Schema (https://standardschema.dev):
 * zod 4, valibot, arktype and other libraries give one. An older schema with only `parse` and
 * `safeParse` (`ZodLike`) also works. Every part of the ecosystem validates and describes a
 * schema through the two functions of this module:
 *
 * - `validateSchema()` validates a value (sync when the schema is sync, so a handler can start
 *   before the first `await`).
 * - `jsonSchemaOf()` gives the JSON Schema of the input or the output, for the MCP tools, the
 *   help and the flags of `mark`, its manifest and the site's catalog.
 *
 * Before, each tool read the private fields of zod 3 (`_def`), the MCP server converted
 * schemas with a zod 3 library, and most procedures had a schema that validated nothing.
 */

import { toJSONSchema } from "zod";
import type { ZodLike } from "../client/validation/types.js";

// =============================================================================
// Standard Schema v1 (the interface of the specification, copied as it advises)
// =============================================================================

/** A schema of the Standard Schema specification, version 1. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The properties of the specification. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace StandardSchemaV1 {
  /** The properties of a Standard Schema. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the specification. */
    readonly version: 1;
    /** The name of the library that made the schema. */
    readonly vendor: string;
    /** The function that validates a value. */
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    /** The input and output types of the schema (types only). */
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result of a validation. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /** A valid value. */
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  /** An invalid value. */
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  /** One problem of an invalid value. */
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /** A part of the path of an issue. */
  export interface PathSegment {
    readonly key: PropertyKey;
  }

  /** The input and output types of a schema. */
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  /** The input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];

  /** The output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}

/**
 * The JSON Schema converter of a schema (the "Standard JSON Schema" property that zod 4 gives in
 * `~standard.jsonSchema`).
 */
export interface StandardJSONSchemaConverter {
  input(options: { target: JsonSchemaTarget }): Record<string, unknown>;
  output(options: { target: JsonSchemaTarget }): Record<string, unknown>;
}

/** The JSON Schema dialects that a converter can give. */
export type JsonSchemaTarget = "draft-2020-12" | "draft-07" | "openapi-3.0";

// =============================================================================
// The schema of a procedure
// =============================================================================

/**
 * The input or output schema of a procedure: a Standard Schema, or an older schema with
 * `parse`/`safeParse` (`ZodLike`).
 */
export type ProcedureSchema<T = unknown> = StandardSchemaV1<unknown, T> | ZodLike<T>;

/** The type that a schema gives. */
export type InferSchema<S> =
  S extends StandardSchemaV1<unknown, infer T> ? T : S extends ZodLike<infer U> ? U : unknown;

/** True for a value that has the properties of a Standard Schema v1. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  const props = (value as { "~standard"?: { version?: unknown; validate?: unknown } })["~standard"];
  return !!props && props.version === 1 && typeof props.validate === "function";
}

// =============================================================================
// Validation
// =============================================================================

/** The result of `validateSchema()`. */
export type SchemaResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string; readonly issues: ReadonlyArray<StandardSchemaV1.Issue> };

/** The text of an issue path: `filter.status` or `items[2]`. */
function pathText(path: StandardSchemaV1.Issue["path"]): string {
  let text = "";
  for (const part of path ?? []) {
    const key = typeof part === "object" && part !== null ? (part as StandardSchemaV1.PathSegment).key : part;
    text += typeof key === "number" ? `[${key}]` : text === "" ? String(key) : `.${String(key)}`;
  }
  return text;
}

/** One line for each issue: `filter: Expected object, received string`. */
export function describeIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): string {
  return issues.map((issue) => (issue.path?.length ? `${pathText(issue.path)}: ${issue.message}` : issue.message)).join("; ");
}

function fromStandard<T>(result: StandardSchemaV1.Result<T>): SchemaResult<T> {
  if (result.issues) {
    return { ok: false, message: describeIssues(result.issues) || "Validation failed", issues: result.issues };
  }
  return { ok: true, value: (result as StandardSchemaV1.SuccessResult<T>).value };
}

/**
 * This function validates a value against a schema. It returns a result, not a Promise, when
 * the schema validates synchronously, so a caller can start the handler before an `await`.
 */
export function validateSchema<T>(schema: ProcedureSchema<T>, value: unknown): SchemaResult<T> | Promise<SchemaResult<T>> {
  if (isStandardSchema(schema)) {
    const result = (schema as StandardSchemaV1<unknown, T>)["~standard"].validate(value);
    return result instanceof Promise ? result.then(fromStandard) : fromStandard(result);
  }
  const legacy = schema as ZodLike<T>;
  const parsed = legacy.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const error = parsed.error as { message?: string; issues?: StandardSchemaV1.Issue[]; errors?: StandardSchemaV1.Issue[] };
  const issues = error.issues ?? error.errors ?? [{ message: error.message ?? "Validation failed" }];
  return { ok: false, message: error.message ?? describeIssues(issues), issues };
}

/** This function validates a value and waits for an asynchronous schema. */
export async function validateSchemaAsync<T>(schema: ProcedureSchema<T>, value: unknown): Promise<SchemaResult<T>> {
  return validateSchema(schema, value);
}

// =============================================================================
// JSON Schema
// =============================================================================

/** A JSON Schema object. */
export type JsonSchema = Record<string, unknown>;

/**
 * A schema that describes itself: a pass-through schema can give a JSON Schema this way (for
 * example `{}`, any value). A Standard Schema with a converter does not need it.
 */
export interface JsonSchemaSource {
  readonly "~jsonSchema"?: JsonSchema | undefined;
}

/**
 * The JSON Schema of the input (`io: "input"`, the default) or the output of a schema, or
 * `undefined` when the schema cannot describe itself (a custom schema with only `parse`).
 *
 * The default dialect is draft-07, which every MCP client reads. A zod type that JSON cannot
 * show (a date, a transform) becomes `{}`, so a description never fails.
 */
export function jsonSchemaOf(
  schema: ProcedureSchema | undefined,
  options: { io?: "input" | "output"; target?: JsonSchemaTarget } = {}
): JsonSchema | undefined {
  if (!schema) return undefined;
  const io = options.io ?? "input";
  const target = options.target ?? "draft-07";
  const own = (schema as JsonSchemaSource)["~jsonSchema"];
  if (own) return own;
  // A zod 4 schema: z.toJSONSchema can replace the types that JSON cannot show
  if ((schema as { _zod?: unknown })._zod !== undefined) {
    try {
      return withoutDialect(toJSONSchema(schema as never, { io, target, unrepresentable: "any" }) as JsonSchema);
    } catch {
      return undefined;
    }
  }
  // Another library: its Standard JSON Schema converter
  const converter = (schema as { "~standard"?: { jsonSchema?: StandardJSONSchemaConverter } })["~standard"]?.jsonSchema;
  if (converter && typeof converter[io] === "function") {
    try {
      return withoutDialect(converter[io]({ target }));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The `$schema` key names the dialect: a tool list and a manifest do not need it on each schema. */
function withoutDialect(schema: JsonSchema): JsonSchema {
  if (!("$schema" in schema)) return schema;
  const { $schema: _dialect, ...rest } = schema;
  return rest;
}
