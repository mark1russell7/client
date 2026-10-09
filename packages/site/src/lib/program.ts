/**
 * The program model of the Composer.
 *
 * A program is plain JSON: the procedure-as-data format that `client.exec()` runs. An object
 * with `$proc` is a procedure call, and an object with `$ref` reads a named result. The
 * Composer edits this JSON directly, so the blocks, the JSON text and the TypeScript code
 * always show the same program.
 */

import type { Field } from "../data/index.js";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A procedure call: `{ $proc: ["client", "add"], input: { a: 1, b: 2 } }`. */
export type ProcRef = {
  $proc: string[];
  input?: Json;
  $name?: string;
  $when?: string;
};

/** A reference to a named result: `{ $ref: "sum" }`, `{ $ref: "item" }`, `{ $ref: "$last" }`. */
export type OutputRef = {
  $ref: string;
};

export function isPlainObject(value: unknown): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isProcRef(value: unknown): value is ProcRef {
  return isPlainObject(value) && Array.isArray(value["$proc"]) && value["$proc"].every((s) => typeof s === "string");
}

export function isOutputRef(value: unknown): value is OutputRef {
  return isPlainObject(value) && typeof value["$ref"] === "string" && Object.keys(value).length === 1;
}

/** The input object of a call, or an empty object. */
export function inputOf(ref: ProcRef): { [key: string]: Json } {
  return isPlainObject(ref.input) ? ref.input : {};
}

/** The key of a call: "client.add". */
export function keyOf(ref: ProcRef): string {
  return ref.$proc.join(".");
}

/** A default value for a TypeScript type of a field: 0 for `number`, `[]` for an array and so on. */
export function defaultValue(type: string): Json {
  const t = type.trim();
  if (t === "number") return 0;
  if (t === "string") return "";
  if (t === "boolean") return false;
  if (t.endsWith("[]") || t.startsWith("Array<") || t.startsWith("readonly ")) return [];
  if (t.startsWith("Record<") || t.startsWith("{")) return {};
  const literal = /^"([^"]*)"/.exec(t);
  if (literal) return literal[1] ?? "";
  return null;
}

/** A value that a new slot gets: null, 0, "", false, an empty list, an empty object or an empty `$ref`. */
export function isEmptyValue(value: Json | undefined): boolean {
  if (value === undefined || value === null || value === 0 || value === "" || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isOutputRef(value)) return value.$ref === "";
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/** A new call of a procedure, with a default value for each required field. */
export function newCall(path: string[], fields: Field[] | null): ProcRef {
  const input: { [key: string]: Json } = {};
  for (const field of fields ?? []) {
    if (!field.optional) input[field.name] = defaultValue(field.type);
  }
  return { $proc: [...path], input };
}

/** The number of procedure calls in a program. */
export function countCalls(value: Json): number {
  let count = 0;
  const stack: Json[] = [value];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (Array.isArray(item)) stack.push(...item);
    else if (isPlainObject(item)) {
      if (isProcRef(item)) count++;
      stack.push(...Object.values(item));
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** The limits of a program that the Composer accepts from a link or from the JSON tab. */
export const LIMITS = {
  /** The levels of nested lists and objects. */
  depth: 64,
  /** The values in the program. */
  nodes: 20_000,
  /** The characters of the JSON text. */
  text: 200_000,
} as const;

/** The keys that a program must not use: they change the prototype of an object. */
const FORBIDDEN_KEYS = new Set(["__proto__"]);

/**
 * This function gives the reason why a value is not a program that the Composer can show, or
 * null for a good program. It examines the depth, the size and the keys without recursion, so
 * a hostile value cannot overflow the stack.
 */
export function checkProgram(value: unknown): string | null {
  let nodes = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const { value: item, depth } = stack.pop()!;
    if (++nodes > LIMITS.nodes) return `The program has more than ${LIMITS.nodes.toLocaleString("en")} values.`;
    if (depth > LIMITS.depth) return `The program has more than ${LIMITS.depth} levels of nested values.`;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return "The program has a number that is not finite.";
      continue;
    }
    if (Array.isArray(item)) {
      for (const child of item) stack.push({ value: child, depth: depth + 1 });
      continue;
    }
    if (isPlainObject(item)) {
      for (const key of Object.keys(item)) {
        if (FORBIDDEN_KEYS.has(key)) return `The key "${key}" is not allowed.`;
        stack.push({ value: item[key], depth: depth + 1 });
      }
      continue;
    }
    return `The program has a value that is not JSON (${typeof item}).`;
  }
  return null;
}

/** The program of a JSON text, or the reason why the text is not a program. */
export function parseProgram(text: string): { ok: true; program: Json } | { ok: false; reason: string } {
  if (text.length > LIMITS.text) {
    return { ok: false, reason: `The program has more than ${LIMITS.text.toLocaleString("en")} characters.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `The JSON is not valid: ${error instanceof Error ? error.message : String(error)}` };
  }
  const problem = checkProgram(parsed);
  return problem === null ? { ok: true, program: parsed as Json } : { ok: false, reason: problem };
}

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function tsValue(value: Json, indent: string, nested: boolean): string {
  if (isProcRef(value)) {
    const input = value.input === undefined ? "" : `.input(${tsValue(value.input, indent, true)})`;
    const name = value.$name ? `.name(${JSON.stringify(value.$name)})` : "";
    const when = value.$when ? `.when(${JSON.stringify(value.$when)})` : "";
    return `proc(${JSON.stringify(value.$proc)})${input}${name}${when}${nested ? ".ref" : ".build()"}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inner = indent + "  ";
    return `[\n${value.map((item) => inner + tsValue(item, inner, true)).join(",\n")},\n${indent}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const inner = indent + "  ";
    const lines = entries.map(
      ([key, item]) => `${inner}${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${tsValue(item, inner, true)}`,
    );
    return `{\n${lines.join(",\n")},\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** The keys of the calls in a program. */
export function callKeys(program: Json): Set<string> {
  const keys = new Set<string>();
  const stack: Json[] = [program];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (Array.isArray(item)) stack.push(...item);
    else if (isPlainObject(item)) {
      if (isProcRef(item)) keys.add(keyOf(item));
      stack.push(...Object.values(item));
    }
  }
  return keys;
}

/**
 * The program as TypeScript with the `proc()` builder of `@mark1russell7/client`. The code runs
 * as it is: it registers the core procedures, and it imports the package of each other
 * procedure. `packageOf` gives the npm name of the package that defines a procedure key.
 */
export function toTypeScript(program: Json, packageOf: (key: string) => string | undefined = () => undefined): string {
  const body = isProcRef(program) ? tsValue(program, "", false) : tsValue(program, "", true);
  const packages = new Set<string>();
  for (const key of callKeys(program)) {
    const name = packageOf(key);
    if (name && name !== "@mark1russell7/client") packages.add(name);
  }
  return [
    `import { Client, LocalTransport, PROCEDURE_REGISTRY, allCoreProcedures, proc } from "@mark1russell7/client";`,
    ...[...packages].sort().map((name) => `import "${name}"; // registers its procedures`),
    ``,
    `// The core procedures (client.*) are not in the registry by default`,
    `for (const procedure of allCoreProcedures) {`,
    `  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);`,
    `}`,
    ``,
    `const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));`,
    `const result = await client.exec(${body});`,
    `console.log(JSON.stringify(result, null, 2));`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

/** The program as base64url text for a share link. */
export function encodeProgram(program: Json): string {
  const bytes = new TextEncoder().encode(JSON.stringify(program));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The program of a share link, or the reason why the text is not a valid program. */
export function readProgram(text: string): { ok: true; program: Json } | { ok: false; reason: string } {
  // base64 makes 4 characters from 3 bytes
  if (text.length > (LIMITS.text * 4) / 3 + 4) {
    return { ok: false, reason: `The program has more than ${LIMITS.text.toLocaleString("en")} characters.` };
  }
  let json: string;
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "The link text is not a program (it is not base64url UTF-8 text)." };
  }
  return parseProgram(json);
}

/** The program of a share link, or undefined when the text is not a valid program. */
export function decodeProgram(text: string): Json | undefined {
  const read = readProgram(text);
  return read.ok ? read.program : undefined;
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/** A position in a program: the keys and indexes from the root. */
export type Location = Array<string | number>;

/** The text form of a location, for maps and element attributes. */
export function locationKey(location: Location): string {
  return JSON.stringify(location);
}

export function parseLocation(key: string): Location | undefined {
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) && value.every((step) => typeof step === "string" || typeof step === "number")
      ? (value as Location)
      : undefined;
  } catch {
    return undefined;
  }
}

function ownValue(object: { [key: string]: Json }, key: string): Json | undefined {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

export function getAt(root: Json, location: Location): Json | undefined {
  let value: Json | undefined = root;
  for (const step of location) {
    if (Array.isArray(value) && typeof step === "number") value = value[step];
    else if (isPlainObject(value) && typeof step === "string") value = ownValue(value, step);
    else return undefined;
  }
  return value;
}

/**
 * This function tells if `setAt` can put a value at `location`. Each step must go into a value
 * that exists and has the right kind: an index into a list (or the index after its last item),
 * a key into an object. Only a missing key of an object can make a new object, for example
 * the `input` of a call. Thus an edit for an old location never changes the kind of a value.
 */
export function canSetAt(root: Json, location: Location): boolean {
  let value: Json | undefined = root;
  for (let index = 0; index < location.length; index++) {
    const step = location[index];
    const last = index === location.length - 1;
    if (Array.isArray(value)) {
      if (typeof step !== "number" || !Number.isInteger(step) || step < 0) return false;
      if (step > value.length || (!last && step === value.length)) return false;
      value = value[step];
    } else if (isPlainObject(value)) {
      if (typeof step !== "string" || FORBIDDEN_KEYS.has(step)) return false;
      const next = ownValue(value, step);
      // A missing key: the rest of the steps make new objects
      if (next === undefined) return location.slice(index + 1).every((rest) => typeof rest === "string" && !FORBIDDEN_KEYS.has(rest));
      value = next;
    } else {
      return false;
    }
  }
  return true;
}

/** The error of an edit for a location that does not exist in the program. */
export class LocationError extends Error {
  constructor(location: Location) {
    super(`The location ${locationKey(location)} is not in the program.`);
    this.name = "LocationError";
  }
}

function setIn(root: Json | undefined, location: Location, value: Json | undefined): Json {
  if (location.length === 0) return value ?? null;
  const [step, ...rest] = location;
  if (Array.isArray(root) && typeof step === "number") {
    const copy = [...root];
    if (rest.length === 0 && value === undefined) copy.splice(step, 1);
    else copy[step] = setIn(root[step], rest, value);
    return copy;
  }
  const object: { [key: string]: Json } = isPlainObject(root) ? root : {};
  const key = String(step);
  if (rest.length === 0 && value === undefined) {
    const copy = { ...object };
    delete copy[key];
    return copy;
  }
  // A computed key makes an own property, also for a key such as "constructor"
  return { ...object, [key]: setIn(ownValue(object, key), rest, value) };
}

/**
 * A copy of `root` with `value` at `location`. `undefined` removes the key or the list item.
 * The function throws `LocationError` when `canSetAt` is false.
 */
export function setAt(root: Json, location: Location, value: Json | undefined): Json {
  if (!canSetAt(root, location)) throw new LocationError(location);
  return setIn(root, location, value);
}

/** This function renames a key of an object and keeps the order of the keys. */
export function renameKey(object: { [key: string]: Json }, from: string, to: string): { [key: string]: Json } {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key === from ? to : key, value]));
}

/** The reason why `to` cannot be a new name for the key `from` of `object`, or null. */
export function renameProblem(object: { [key: string]: Json }, from: string, to: string): string | null {
  if (to === "") return "A key cannot be empty.";
  if (to === from) return null;
  if (FORBIDDEN_KEYS.has(to)) return `The key "${to}" is not allowed.`;
  if (Object.hasOwn(object, to)) return `The object already has the key "${to}".`;
  return null;
}

// ---------------------------------------------------------------------------
// Compact JSON
// ---------------------------------------------------------------------------

const INLINE_WIDTH = 64;

/** JSON on one line, with a space after each comma and colon. */
function inlineJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
  if (entries.length === 0) return "{}";
  return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inlineJson(item)}`).join(", ")} }`;
}

/** JSON with two spaces of indent, but a short array or object stays on one line. */
export function formatJson(value: unknown, indent = ""): string {
  if (value === undefined) return "undefined";
  const inline = inlineJson(value);
  if (value === null || typeof value !== "object" || inline.length + indent.length <= INLINE_WIDTH) return inline;
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    const items = value.map((item) => inner + formatJson(item, inner));
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
  const lines = entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJson(item, inner)}`);
  return `{\n${lines.join(",\n")}\n${indent}}`;
}
