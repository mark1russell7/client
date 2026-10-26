/**
 * The envelope form of a program (coeval, decisions D6, D9, D10 and D12, roadmap item M7).
 *
 * A document of coeval is an envelope: `{ type, value }`. The header can also have `name` and
 * `own`. In the envelope form of a program:
 *
 * - A call is `{ type: path, value: input }`. The type is the path of a procedure, as an array of
 *   keys. A ref into the world, `{ type: "ref", value: ["world", ...path] }`, is also a type.
 *   The arrays `["ref"]` and `["lit"]` are kinds of the kernel, not paths. A procedure with the
 *   path `["ref"]` or `["lit"]` has a ref into the world as its type.
 * - A ref is `{ type: "ref", value: ["names", name, ...fields] }`. The name `last` reads the result
 *   of the step before.
 * - A literal is `{ type: "literal", value }`. Nothing in its value runs. The type `"lit"` (the kind
 *   of the kernel, coeval D12) is an alias: `{ type: "lit", value }` is also a literal.
 *
 * The functions of this module read the envelopes with the helpers of `@mark1russell7/coeval`
 * (`isTypeRef`, `typePath`, `ref`). `fromEnvelopeProgram()` changes the envelope form into the
 * `$proc` form, and `client.exec()` then runs the program on the kernel (`program.ts`). In the
 * input of a `$proc` program, an envelope is data. Thus the root of a program decides its form,
 * and the old programs do not change.
 */

import { ENVELOPE_KEYS, isTypeRef, ref as refDocument, typePath } from "@mark1russell7/coeval";
import {
  LITERAL_KEY,
  MAX_DATA_DEPTH,
  OUTPUT_REF_KEY,
  PROCEDURE_JSON_KEY,
  PROCEDURE_NAME_KEY,
  PROCEDURE_WHEN_KEY,
  isAnyProcedureRef,
  isLiteral,
  isOutputRef,
  isPlainObject,
  isProcedureRef,
  normalizeRef,
  type AnyProcedureRef,
  type OutputRef,
  type ProcedureRefJson,
} from "./ref.js";
import type { ProcedurePath } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/** This type is a path of keys from a root of the context (coeval D10). */
export type EnvelopePath = readonly (string | number)[];

/**
 * This document reads a value: `{ type: "ref", value: [root, step, ...] }` (coeval D10). A client
 * program reads only the root `names`. A ref into the world is only the type of a call.
 */
export interface EnvelopeRef {
  readonly type: "ref";
  readonly value: EnvelopePath;
}

/**
 * This document gives its value as data. Nothing in the value runs. The functions of this module
 * write the type `"literal"`, and they also read the alias `"lit"` (coeval D12: the kind `lit`).
 */
export interface EnvelopeLiteral {
  readonly type: "literal";
  readonly value: unknown;
}

/**
 * This document is a call in the envelope form (coeval D9). The type is the path of the
 * procedure, or a ref into the world. The value is the input. A value of `null` gives no input.
 */
export interface EnvelopeProgram {
  /**
   * The path of the procedure, or a ref into the world: `{ type: "ref", value: ["world", ...path] }`.
   *
   * The types `["ref"]` and `["lit"]` (arrays of one key) are the kinds `ref` and `lit` of the
   * kernel (D26). Before 0.26.0, they were calls of the procedures with these paths. A ref into
   * the world is always a call: it is the type of these procedures, for example
   * `{ type: { type: "ref", value: ["world", "ref"] }, value }`.
   */
  readonly type: readonly string[] | EnvelopeRef;
  /** The input of the call. `null` gives a call without input. */
  readonly value: unknown;
  /** The name of the result. A later step of `client.chain` reads it as `["names", name]`. */
  readonly name?: string | undefined;
  /** The own entries of the document. A client program has none: the conversion refuses this key. */
  readonly own?: unknown;
}

// =============================================================================
// The shapes of the envelope form
// =============================================================================

/** The keys of an envelope (coeval D6). */
const HEADER_KEYS: ReadonlySet<string> = new Set<string>(ENVELOPE_KEYS);

/** The keys that make an object a construct of the `$proc` form. */
const NATIVE_KEYS: readonly string[] = [PROCEDURE_JSON_KEY, OUTPUT_REF_KEY, LITERAL_KEY];

/** The keys of a `$proc` call that the envelope form keeps (`$when` gives its own error). */
const CALL_KEYS: ReadonlySet<string> = new Set([PROCEDURE_JSON_KEY, "input", PROCEDURE_NAME_KEY, PROCEDURE_WHEN_KEY]);

/** The keys of a runtime `ProcedureRef` that the envelope form keeps. */
const RUNTIME_CALL_KEYS: ReadonlySet<string> = new Set(["path", "input", PROCEDURE_NAME_KEY, PROCEDURE_WHEN_KEY]);

const REF_TYPE = "ref";
/** The type of a literal that this module writes (the form of 0.23.0). */
const LITERAL_TYPE = "literal";
/** The alias of the literal type: the kind `lit` of the kernel (coeval D12). */
const LIT_ALIAS = "lit";
const NAMES_ROOT = "names";
const WORLD_ROOT = "world";
/** The name of the result of the step before, in the envelope form. */
const LAST_NAME = "last";
/** The name of the result of the step before, in the `$proc` form. */
const NATIVE_LAST = "$last";

/** An object with the shape of an envelope. */
type EnvelopeShape = Record<string, unknown> & { type: unknown; value: unknown; name?: unknown; own?: unknown };

/** The kind of an envelope. `bad-type` is an envelope whose type is a ref that is not into the world. */
type EnvelopeKind = "call" | "ref" | "literal" | "bad-type";

/**
 * This function gives true if a value is a plain object with `type`, `value` and only header keys.
 * The test is looser than `isEnvelope()` of coeval: a bad header gives an error, not data.
 */
function isEnvelopeShape(value: unknown): value is EnvelopeShape {
  return (
    isPlainObject(value) &&
    Object.hasOwn(value, "type") &&
    Object.hasOwn(value, "value") &&
    Object.keys(value).every((key) => HEADER_KEYS.has(key))
  );
}

/** This function gives true if a value is a procedure path: an array of one or more strings. */
function isProcedurePath(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((key) => typeof key === "string");
}

/** The keys of the type of an envelope (coeval `typePath()`), or undefined for a value that is not a type. */
function keysOfType(type: unknown): readonly (string | number)[] | undefined {
  // A ref into the world as a type has only the keys `type` and `value`
  if (isPlainObject(type) && Object.keys(type).length !== 2) return undefined;
  return isTypeRef(type) ? typePath(type) : undefined;
}

/** This function gives true if a procedure path is also a kind of the kernel as an array: `["ref"]` or `["lit"]`. */
function isKindPath(keys: readonly unknown[]): boolean {
  return keys.length === 1 && (keys[0] === REF_TYPE || keys[0] === LIT_ALIAS);
}

/**
 * This function gives the procedure path of the type of a call, or undefined for another type. The
 * type of a call is a list of keys, or a ref into the world. A text is a kind of the kernel or data.
 * The arrays `["ref"]` and `["lit"]` are kinds. A ref into the world is always a call, so it is the
 * type of the procedures `["ref"]` and `["lit"]`.
 */
function callPath(type: unknown): ProcedurePath | undefined {
  if (typeof type === "string") return undefined;
  const keys = keysOfType(type);
  if (!isProcedurePath(keys) || (Array.isArray(type) && isKindPath(keys))) return undefined;
  return [...keys];
}

/** This function gives the kind of an envelope, or undefined for data. */
function envelopeKind(value: unknown): EnvelopeKind | undefined {
  if (!isEnvelopeShape(value)) return undefined;
  if (callPath(value.type)) return "call";
  const keys = keysOfType(value.type);
  if (keys?.length === 1 && keys[0] === REF_TYPE) return "ref";
  // The text "literal" (an array ["literal"] is a call, as in 0.23.0), or the alias "lit"
  if (value.type === LITERAL_TYPE || (keys?.length === 1 && keys[0] === LIT_ALIAS)) return "literal";
  if (isPlainObject(value.type) && value.type["type"] === REF_TYPE) return "bad-type";
  return undefined;
}

/** This function gives true if a plain object has a key of the `$proc` form. */
function hasNativeKey(value: Record<string, unknown>): boolean {
  return NATIVE_KEYS.some((key) => Object.hasOwn(value, key));
}

/** This function gives a short JSON text of a value for an error message. */
function preview(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = undefined;
  }
  text ??= String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * This function gives the result of `fn` one level deeper in a walk of a program. It refuses an
 * object that contains itself, and a program deeper than `MAX_DATA_DEPTH`, as hydration does.
 */
function within<T>(value: object, path: Set<object>, depth: number, fn: () => T): T {
  if (depth > MAX_DATA_DEPTH) {
    throw new Error(`The program has more than ${MAX_DATA_DEPTH} levels of nesting`);
  }
  if (path.has(value)) {
    throw new Error("The program is cyclic (an object contains itself)");
  }
  path.add(value);
  try {
    return fn();
  } finally {
    path.delete(value);
  }
}

// =============================================================================
// The envelope form to the $proc form
// =============================================================================

/**
 * This function gives true if a value is a program in the envelope form. The value is a plain
 * object with the keys `type` and `value`, and only the header keys `name` and `own` in
 * addition. The type is a procedure path (an array of one or more strings), or a ref into the
 * world: `{ type: "ref", value: ["world", ...path] }`.
 *
 * @example
 * ```typescript
 * isEnvelopeProgram({ type: ["client", "add"], value: { a: 1, b: 2 } }); // true
 * isEnvelopeProgram({ $proc: ["client", "add"], input: { a: 1, b: 2 } }); // false
 * ```
 */
export function isEnvelopeProgram(value: unknown): value is EnvelopeProgram {
  return envelopeKind(value) === "call";
}

/**
 * This function changes a program in the envelope form into the `$proc` form. `hydrateInput()`
 * and `client.exec()` start the result.
 *
 * The conversion:
 * - A call gives `{ $proc: path, input }`. A value of `null` gives a call without `input`. The
 *   header `name` gives `$name`.
 * - A ref `["names", "last"]` gives `{ $ref: "$last" }`. A ref `["names", name, ...fields]` gives
 *   `{ $ref: "name.field" }`.
 * - A literal gives `{ $literal: value }`.
 * - An object with a `$proc`, `$ref` or `$literal` key is data: the function puts it in a
 *   `$literal`. A runtime `ProcedureRef` is data too.
 * - The function copies the arrays and the other plain objects. Other values stay the same.
 *
 * The function throws an error for a ref with a root other than `names`, and for a bad key of a
 * ref path. It also throws an error for a header on a ref or a literal, and for the key `own`.
 * The envelope form has no `$when`: a program that needs it keeps the `$proc` form.
 *
 * @example
 * ```typescript
 * fromEnvelopeProgram({
 *   type: ["client", "multiply"],
 *   value: { a: { type: "ref", value: ["names", "item"] }, b: 10 },
 * });
 * // { $proc: ["client", "multiply"], input: { a: { $ref: "item" }, b: 10 } }
 * ```
 */
export function fromEnvelopeProgram(program: EnvelopeProgram): ProcedureRefJson {
  if (!isEnvelopeProgram(program)) {
    throw new Error(
      `fromEnvelopeProgram() requires a call: { "type": [procedure path], "value": input }. Got ${preview(program)}`
    );
  }
  const path = new Set<object>();
  return within(program, path, 0, () => fromCall(program as EnvelopeShape, path, 0));
}

/** This function changes a call envelope into a `$proc` call. */
function fromCall(call: EnvelopeShape, path: Set<object>, depth: number): ProcedureRefJson {
  const procedurePath = callPath(call.type)!;
  if (call.own !== undefined) {
    throw new Error(
      `A client program has no own entries: remove the key "own" of the call of ${preview(procedurePath)}`
    );
  }
  if (call.name !== undefined && typeof call.name !== "string") {
    throw new Error(`The name of a call must be a string. The call of ${preview(procedurePath)} has the name ${preview(call.name)}`);
  }
  const native: { $proc: ProcedurePath; input?: unknown; $name?: string } = { $proc: procedurePath };
  // A call without input gets undefined, as a $proc call without `input` (PROGRAM-FORMAT section 1)
  if (call.value !== null && call.value !== undefined) native.input = fromValue(call.value, path, depth + 1);
  if (call.name !== undefined) native.$name = call.name;
  return native;
}

/** This function refuses a header on an envelope that is not a call. */
function refuseHeader(envelope: EnvelopeShape): void {
  for (const key of ["name", "own"]) {
    if (envelope[key] !== undefined) {
      throw new Error(`Only a call has a header. The ${String(envelope.type)} ${preview(envelope)} has the key "${key}"`);
    }
  }
}

/** This function gives the text of one key of a ref path. */
function keyText(key: unknown, refPath: readonly unknown[]): string {
  if (typeof key === "string" && !key.includes(".")) return key;
  if (typeof key === "number" && Number.isSafeInteger(key) && key >= 0) return String(key);
  throw new Error(
    `Each key of a ref path must be a string without a dot or an integer of 0 or more. ` +
      `The key ${preview(key)} of the ref ${preview(refPath)} is not`
  );
}

/** This function changes a ref envelope into a `$ref` object. */
function fromRef(ref: EnvelopeShape): { $ref: string } {
  refuseHeader(ref);
  const refPath = ref.value;
  if (!Array.isArray(refPath) || refPath.length === 0) {
    throw new Error(`The value of a ref must be a path: [root, step, ...]. Got ${preview(refPath)}`);
  }
  const [root, ...steps] = refPath as unknown[];
  if (root !== NAMES_ROOT) {
    const where = root === WORLD_ROOT ? ` A ref into the world is only the type of a call.` : "";
    throw new Error(
      `A client program reads only the root "names". The ref ${preview(refPath)} has the root ${preview(root)}.${where}`
    );
  }
  if (steps.length === 0) {
    throw new Error(`A ref to the root "names" needs a name: ["names", name, ...fields]. Got ${preview(refPath)}`);
  }
  const [name, ...fields] = steps.map((key) => keyText(key, refPath));
  // path-check: the `$ref` text of a program: a name and its fields (PROGRAM-FORMAT.md).
  return { $ref: [name === LAST_NAME ? NATIVE_LAST : name, ...fields].join(".") };
}

/** This function changes a value of an envelope program into the `$proc` form. */
function fromValue(value: unknown, path: Set<object>, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return within(value, path, depth, () => value.map((item) => fromValue(item, path, depth + 1)));
  }
  // The $proc form is data in an envelope program: a runtime ref, and each object that
  // hydration reads as a call or a $ref
  if (isProcedureRef(value)) return { $literal: value };
  if (!isPlainObject(value)) {
    // Values that are not plain data (Date, Map, class instances) stay the same object
    return isAnyProcedureRef(value) || isOutputRef(value) ? { $literal: value } : value;
  }
  switch (envelopeKind(value)) {
    case "call":
      return within(value, path, depth, () => fromCall(value as EnvelopeShape, path, depth));
    case "ref":
      return fromRef(value as EnvelopeShape);
    case "literal":
      refuseHeader(value as EnvelopeShape);
      return { $literal: value["value"] };
    case "bad-type":
      throw new Error(
        `The type of a call must be a procedure path or a ref into the world: ["world", ...path]. Got ${preview(value["type"])}`
      );
  }
  // An object of the $proc form is data in an envelope program
  if (hasNativeKey(value)) return { $literal: value };
  return within(value, path, depth, () =>
    // Object.fromEntries makes own properties, also for a key such as "__proto__"
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromValue(item, path, depth + 1)]))
  );
}

// =============================================================================
// The $proc form to the envelope form
// =============================================================================

/**
 * This function changes a program in the `$proc` form into the envelope form, for a tool that
 * shows it. `fromEnvelopeProgram()` changes the result back into the same program.
 *
 * The conversion:
 * - A call gives `{ type: path, value: input }`. A call without input gives the value `null`.
 *   `$name` gives the header `name`. The path `["ref"]` or `["lit"]` gives a ref into the world as
 *   the type, because these arrays are kinds of the kernel.
 * - `{ $ref: "$last" }` gives `["names", "last"]`. `{ $ref: "a.b" }` gives `["names", "a", "b"]`.
 * - `{ $literal: value }` gives a literal.
 * - Data that the envelope form reads in a different way gives a literal. This data is an object
 *   with the shape of a call, a ref or a literal. It is also an object with a `$proc`, `$ref` or
 *   `$literal` key.
 *
 * The function throws an error for a program that the envelope form cannot keep:
 * - a call with `$when`, or with a key other than the path, the input and the name,
 * - a `$ref` object with other keys, or a ref to a step with the name `last`,
 * - such data that holds a call, a `$ref` or a `$literal`.
 *
 * These programs keep the `$proc` form.
 *
 * The round trip gives the same program, with two exceptions. A call with the input `null`, and
 * data that the envelope form reads in a different way, come back in a `$literal`. They give
 * the same values.
 *
 * @example
 * ```typescript
 * toEnvelopeProgram({ $proc: ["client", "add"], input: { a: { $ref: "$last" }, b: 1 }, $name: "sum" });
 * // { type: ["client", "add"], value: { a: { type: "ref", value: ["names", "last"] }, b: 1 }, name: "sum" }
 * ```
 */
export function toEnvelopeProgram(program: AnyProcedureRef): EnvelopeProgram {
  if (!isAnyProcedureRef(program)) {
    throw new Error(
      `toEnvelopeProgram() requires a call: { "$proc": [procedure path], "input": input }. Got ${preview(program)}`
    );
  }
  const path = new Set<object>();
  return within(program, path, 0, () => toCall(program, path, 0));
}

/** This function changes a `$proc` call into a call envelope. */
function toCall(call: AnyProcedureRef, path: Set<object>, depth: number): EnvelopeProgram {
  const { path: procedurePath, input, $name, $when } = normalizeRef(call);
  if ($when !== undefined) {
    throw new Error(
      `The call of ${preview(procedurePath)} has "$when": ${preview($when)}. ` +
        `The envelope form has no $when: keep this program in the $proc form`
    );
  }
  if (!isProcedurePath(procedurePath)) {
    throw new Error(`The path of a call must be one or more strings. Got ${preview(procedurePath)}`);
  }
  // A key that the envelope form cannot keep has no envelope form: the conversion does not drop it
  const keys = isProcedureRef(call) ? RUNTIME_CALL_KEYS : CALL_KEYS;
  const other = Object.keys(call).find((key) => !keys.has(key));
  if (other !== undefined) {
    throw new Error(
      `The call of ${preview(procedurePath)} has the key "${other}". The envelope form keeps only ` +
        `the path, the input and the name: keep this program in the $proc form`
    );
  }
  if ($name !== undefined && typeof $name !== "string") {
    throw new Error(`The $name of a call must be a string. The call of ${preview(procedurePath)} has ${preview($name)}`);
  }
  const value =
    input === undefined
      ? null
      : input === null
        ? { type: LITERAL_TYPE, value: null }
        : toValue(input, path, depth + 1);
  const type: EnvelopeProgram["type"] = isKindPath(procedurePath)
    ? (refDocument(WORLD_ROOT, ...procedurePath) as unknown as EnvelopeRef)
    : [...procedurePath];
  return { type, value, ...($name !== undefined ? { name: $name } : {}) };
}

/** This function changes a `$ref` object into a ref envelope. */
function toRef(ref: OutputRef): EnvelopeRef {
  const refText = ref.$ref;
  if (Object.keys(ref).length !== 1) {
    throw new Error(
      `The $ref object ${preview(ref)} has other keys. The envelope form keeps only the path: keep this program in the $proc form`
    );
  }
  // path-check: the `$ref` text of a program: a name and its fields (PROGRAM-FORMAT.md).
  const [name, ...fields] = refText.split(".");
  if (name === LAST_NAME) {
    throw new Error(
      `The ref "${refText}" reads a step with the name "last". In the envelope form, ` +
        `["names", "last"] reads the result of the step before: give the step a different name`
    );
  }
  return refDocument(NAMES_ROOT, name === NATIVE_LAST ? LAST_NAME : name!, ...fields) as unknown as EnvelopeRef;
}

/** This function gives true if a value of the `$proc` form is a call, a `$ref` or a `$literal`. */
function isNativeConstruct(value: unknown): boolean {
  return isAnyProcedureRef(value) || isOutputRef(value) || isLiteral(value);
}

/** This function gives true if the arrays and plain objects in a value hold a construct of the `$proc` form. */
function holdsNativeConstruct(value: unknown, path: Set<object>, depth: number): boolean {
  const children = Array.isArray(value) ? value : isPlainObject(value) ? Object.values(value) : [];
  if (children.length === 0) return false;
  return within(value as object, path, depth, () =>
    children.some((child) => isNativeConstruct(child) || holdsNativeConstruct(child, path, depth + 1))
  );
}

/** This function changes a value of a `$proc` program into the envelope form. */
function toValue(value: unknown, path: Set<object>, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  // The same order as hydration: a $literal, then a $ref, then a call
  if (isLiteral(value)) return { type: LITERAL_TYPE, value: value.$literal };
  if (isOutputRef(value)) return toRef(value);
  if (isAnyProcedureRef(value)) return within(value, path, depth, () => toCall(value, path, depth));
  if (Array.isArray(value)) {
    return within(value, path, depth, () => value.map((item) => toValue(item, path, depth + 1)));
  }
  // Values that are not plain data (Date, Map, class instances) stay the same object
  if (!isPlainObject(value)) return value;
  if (envelopeKind(value) !== undefined || hasNativeKey(value)) {
    // The envelope form reads this data in a different way: it becomes a literal. A literal
    // stops the hydration of its value, so a value that holds a construct has no envelope form.
    if (holdsNativeConstruct(value, path, depth)) {
      throw new Error(
        `The data ${preview(value)} has the shape of a construct of the envelope form, and it holds a ` +
          `call, a $ref or a $literal. It has no envelope form: keep this program in the $proc form`
      );
    }
    return { type: LITERAL_TYPE, value };
  }
  const converted = within(value, path, depth, () =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toValue(item, path, depth + 1)]))
  );
  // A $ref in the type of such data gives a type that is a ref, but not into the world
  if (envelopeKind(converted) !== undefined) {
    throw new Error(
      `The data ${preview(value)} has a type that the envelope form reads as a ref. It has no envelope form: ` +
        `keep this program in the $proc form`
    );
  }
  return converted;
}
