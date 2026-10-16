/**
 * JSON values: the check, the copy and the comparison. The procedures of this package take and
 * give only JSON values: null, booleans, finite numbers, strings, arrays and plain objects.
 *
 * Each object that this package makes has own data properties only, so a key `__proto__` of the
 * data stays data: it does not change the prototype of the object (roadmap R6).
 */

/** A JSON value. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** The keys that reach a prototype. A pointer, a path or a patch of this package refuses them. */
export const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** The kinds of `JsonError`. */
export type JsonErrorCode =
  /** A value is not JSON: `undefined`, `NaN`, a function, a date or a class instance. */
  | "NOT_JSON"
  /** A JSON Pointer or a path query is not valid. */
  | "INVALID_POINTER"
  /** A pointer, a path or a patch names `__proto__`, `constructor` or `prototype`. */
  | "PROTOTYPE_KEY"
  /** An operation of a patch is not valid, or its location does not exist. */
  | "INVALID_PATCH"
  /** A `test` operation of a patch found another value. */
  | "TEST_FAILED"
  /** The YAML text is not valid, or it has a value that JSON does not have. */
  | "INVALID_YAML"
  /** The JSON Schema is not a schema. */
  | "INVALID_SCHEMA";

/** An error of a procedure of this package. A server sends it with the code `HANDLER_ERROR`. */
export class JsonError extends Error {
  override readonly name = "JsonError";

  constructor(
    readonly code: JsonErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** True for an object whose prototype is `Object.prototype` or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** This function sets an own data property: a key `__proto__` stays data. */
export function put(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

/** True when the object has an own property with this key. */
export function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/** The text of one reference token of a JSON Pointer (RFC 6901): `~` and `/` are escaped. */
export function escapeToken(token: string | number): string {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

/** The JSON Pointer of a list of tokens. */
export function formatPointer(tokens: readonly (string | number)[]): string {
  return tokens.map((token) => `/${escapeToken(token)}`).join("");
}

/** The description of a value that is not JSON, or undefined for a JSON value. */
function notJson(value: unknown): string | undefined {
  switch (typeof value) {
    case "string":
    case "boolean":
      return undefined;
    case "number":
      return Number.isFinite(value) ? undefined : `the number ${String(value)}`;
    case "object":
      if (value === null || Array.isArray(value) || isPlainObject(value)) return undefined;
      return `an object of the class ${(value as { constructor?: { name?: string } }).constructor?.name ?? "unknown"}`;
    default:
      return `a value of the type ${typeof value}`;
  }
}

/**
 * This function throws `NOT_JSON` when a part of the value is not JSON. The message has the JSON
 * Pointer of the part. `label` starts the message: the procedure and the field.
 */
export function assertJson(value: unknown, label: string): asserts value is JsonValue {
  const stack: Array<{ value: unknown; tokens: (string | number)[] }> = [{ value, tokens: [] }];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const { value: current, tokens } = stack.pop()!;
    const problem = notJson(current);
    if (problem !== undefined) {
      throw new JsonError("NOT_JSON", `${label}: the value at "${formatPointer(tokens)}" is ${problem}, which JSON does not have`);
    }
    if (current === null || typeof current !== "object") continue;
    if (seen.has(current)) throw new JsonError("NOT_JSON", `${label}: the value at "${formatPointer(tokens)}" refers to itself`);
    seen.add(current);
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index--) stack.push({ value: current[index], tokens: [...tokens, index] });
    } else {
      for (const key of Object.keys(current)) stack.push({ value: (current as Record<string, unknown>)[key], tokens: [...tokens, key] });
    }
  }
}

/** A deep copy of a JSON value. Each object of the copy has own data properties only. */
export function cloneJson<T extends JsonValue>(value: T): T;
export function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => cloneJson(item));
  const copy: Record<string, JsonValue> = {};
  for (const key of Object.keys(value)) put(copy, key, cloneJson(value[key]!));
  return copy;
}

/**
 * True when two JSON values are equal: the same type and value, arrays with equal items in the
 * same order, and objects with the same keys and equal values in any order. The number 0 and -0
 * are equal, as in JSON.
 */
export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]!));
  }
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => hasOwn(b, key) && jsonEqual(a[key]!, b[key]!));
}

/** The JSON type of a value, for a message. */
export function typeName(value: JsonValue | undefined): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}
