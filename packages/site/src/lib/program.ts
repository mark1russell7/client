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
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countCalls(item), 0);
  if (!isPlainObject(value)) return 0;
  const own = isProcRef(value) ? 1 : 0;
  return own + Object.values(value).reduce<number>((sum, item) => sum + countCalls(item), 0);
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

/** The program as TypeScript with the `proc()` builder of `@mark1russell7/client`. */
export function toTypeScript(program: Json): string {
  const body = isProcRef(program) ? tsValue(program, "", false) : tsValue(program, "", true);
  return [
    `import { Client, LocalTransport, proc } from "@mark1russell7/client";`,
    ``,
    `const client = new Client(new LocalTransport());`,
    `const result = await client.exec(${body});`,
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

/** The program of a share link, or undefined when the text is not a valid program. */
export function decodeProgram(text: string): Json | undefined {
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Json;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/** A position in a program: the keys and indexes from the root. */
export type Location = Array<string | number>;

export function getAt(root: Json, location: Location): Json | undefined {
  let value: Json | undefined = root;
  for (const step of location) {
    if (Array.isArray(value) && typeof step === "number") value = value[step];
    else if (isPlainObject(value) && typeof step === "string") value = value[step];
    else return undefined;
  }
  return value;
}

/** A copy of `root` with `value` at `location`. `undefined` removes the key or the array item. */
export function setAt(root: Json, location: Location, value: Json | undefined): Json {
  if (location.length === 0) return value ?? null;
  const [step, ...rest] = location;
  if (Array.isArray(root) && typeof step === "number") {
    const copy = [...root];
    if (rest.length === 0 && value === undefined) copy.splice(step, 1);
    else copy[step] = setAt(root[step] ?? null, rest, value);
    return copy;
  }
  const object = isPlainObject(root) ? { ...root } : {};
  const key = String(step);
  if (rest.length === 0 && value === undefined) delete object[key];
  else object[key] = setAt(object[key] ?? null, rest, value);
  return object;
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
