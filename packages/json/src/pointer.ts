/**
 * JSON Pointer (RFC 6901): the parse, and the value at a pointer.
 *
 * A pointer is `""` (the whole value) or a list of reference tokens, each after a `/`. In a token,
 * `~1` is `/` and `~0` is `~`. A pointer in the URI fragment form (`#/a/b`) is accepted too. A
 * pointer that names `__proto__`, `constructor` or `prototype` is refused (roadmap R6).
 */

import { hasOwn, JsonError, PROTOTYPE_KEYS, type JsonValue } from "./value.js";

/** This function gives the reference tokens of a pointer. A bad pointer throws `INVALID_POINTER`. */
export function parsePointer(pointer: string, label = "pointer"): string[] {
  let text = pointer;
  let fragment = false;
  if (text.startsWith("#")) {
    fragment = true;
    text = text.slice(1);
  }
  if (text === "") return [];
  if (!text.startsWith("/")) {
    throw new JsonError("INVALID_POINTER", `The ${label} ${JSON.stringify(pointer)} is not a JSON Pointer: it must be "" or start with "/"`);
  }
  return text
    .slice(1)
    .split("/")
    .map((raw) => {
      let token = raw;
      if (fragment) {
        try {
          token = decodeURIComponent(raw);
        } catch {
          throw new JsonError("INVALID_POINTER", `The ${label} ${JSON.stringify(pointer)} has a bad percent escape`);
        }
      }
      if (/~[^01]|~$/.test(token)) {
        throw new JsonError("INVALID_POINTER", `The ${label} ${JSON.stringify(pointer)} has a "~" that is not "~0" or "~1"`);
      }
      token = token.replace(/~1/g, "/").replace(/~0/g, "~");
      if (PROTOTYPE_KEYS.has(token)) {
        throw new JsonError("PROTOTYPE_KEY", `The ${label} ${JSON.stringify(pointer)} has the token "${token}", which reaches a prototype`);
      }
      return token;
    });
}

/** The index of an array token (`0`, or a digit 1 to 9 and more digits), or undefined. */
export function arrayIndex(token: string): number | undefined {
  return /^(0|[1-9][0-9]*)$/.test(token) ? Number(token) : undefined;
}

/** The result of a look-up: found, with the value, or not found. */
export type Lookup = { readonly found: true; readonly value: JsonValue } | { readonly found: false };

/** This function gives the value at the tokens of a pointer. Only own keys of an object count. */
export function lookup(value: JsonValue, tokens: readonly string[]): Lookup {
  let current: JsonValue = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = arrayIndex(token);
      if (index === undefined || index >= current.length) return { found: false };
      current = current[index]!;
    } else if (current !== null && typeof current === "object") {
      if (!hasOwn(current, token)) return { found: false };
      current = current[token]!;
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}
