/**
 * A simple path query: a small part of JSONPath, without filters and scripts.
 *
 * | Part | Meaning |
 * |---|---|
 * | `$` | The whole value. It is optional at the start. |
 * | `.name` or `name` | The member `name` of an object. A name has letters, digits, `_`, `$` and `-`. |
 * | `["a.b"]` or `['a.b']` | The member with any key. `\` escapes a quote or a backslash. |
 * | `[2]` | The item 2 of an array. `[-1]` is the last item. |
 * | `*` or `[*]` | Each member of an object, or each item of an array. |
 * | `..name`, `..*`, `..[0]` | The same step on the value and on each value in it, at each depth. |
 *
 * A path that names `__proto__`, `constructor` or `prototype` is refused (roadmap R6).
 */

import { JsonError, PROTOTYPE_KEYS, hasOwn, type JsonValue } from "./value.js";

/** One step of a path. */
export type PathStep =
  | { readonly kind: "key"; readonly key: string; readonly deep: boolean }
  | { readonly kind: "index"; readonly index: number; readonly deep: boolean }
  | { readonly kind: "wildcard"; readonly deep: boolean };

/** One match of a path: its JSON Pointer tokens and its value. */
export interface PathMatch {
  readonly tokens: readonly (string | number)[];
  readonly value: JsonValue;
}

const NAME_CHAR = /[A-Za-z0-9_$\-\u0080-￿]/;

/** This function parses a path query. A bad path throws `INVALID_POINTER`. */
export function parsePath(path: string): PathStep[] {
  const steps: PathStep[] = [];
  const fail = (at: number, message: string): never => {
    throw new JsonError("INVALID_POINTER", `The path ${JSON.stringify(path)} is not valid at character ${at + 1}: ${message}`);
  };
  const key = (name: string, deep: boolean, at: number): PathStep => {
    if (PROTOTYPE_KEYS.has(name)) {
      throw new JsonError("PROTOTYPE_KEY", `The path ${JSON.stringify(path)} has the key "${name}" at character ${at + 1}, which reaches a prototype`);
    }
    return { kind: "key", key: name, deep };
  };
  let i = 0;
  if (path.startsWith("$")) i = 1;
  let first = true;
  while (i < path.length) {
    let deep = false;
    const start = i;
    if (path.startsWith("..", i)) {
      deep = true;
      i += 2;
    } else if (path[i] === ".") {
      i += 1;
    } else if (path[i] !== "[" && !(first && i === 0)) {
      fail(i, 'expected ".", ".." or "["');
    }
    first = false;
    const char = path[i];
    if (char === undefined) fail(i, "the path ends after a dot");
    if (char === "*") {
      steps.push({ kind: "wildcard", deep });
      i += 1;
    } else if (char === "[") {
      if ((path[start] === "." && !deep)) fail(i, 'a "[" does not come after a single "."');
      const close = (from: number): void => {
        if (path[from] !== "]") fail(from, 'expected "]"');
      };
      const inner = path[i + 1];
      if (inner === "*") {
        close(i + 2);
        steps.push({ kind: "wildcard", deep });
        i += 3;
      } else if (inner === '"' || inner === "'") {
        let j = i + 2;
        let name = "";
        while (j < path.length && path[j] !== inner) {
          if (path[j] === "\\") {
            j += 1;
            if (j >= path.length) break;
          }
          name += path[j];
          j += 1;
        }
        if (j >= path.length) fail(i, "the quoted key has no end");
        close(j + 1);
        steps.push(key(name, deep, i));
        i = j + 2;
      } else {
        const match = /^-?(0|[1-9][0-9]*)/.exec(path.slice(i + 1));
        if (!match) fail(i + 1, "expected an index, a quoted key or *");
        close(i + 1 + match![0].length);
        steps.push({ kind: "index", index: Number(match![0]), deep });
        i += match![0].length + 2;
      }
    } else {
      let j = i;
      while (j < path.length && NAME_CHAR.test(path[j]!)) j += 1;
      if (j === i) fail(i, "expected a name, * or [");
      steps.push(key(path.slice(i, j), deep, i));
      i = j;
    }
  }
  return steps;
}

/** The children of a value, in document order: members of an object, or items of an array. */
function children(match: PathMatch): PathMatch[] {
  const { value, tokens } = match;
  if (Array.isArray(value)) return value.map((item, index) => ({ tokens: [...tokens, index], value: item }));
  if (value !== null && typeof value === "object") return Object.keys(value).map((name) => ({ tokens: [...tokens, name], value: value[name]! }));
  return [];
}

/** The value and each value in it, at each depth, in document order. */
function descendants(match: PathMatch): PathMatch[] {
  const out: PathMatch[] = [];
  const visit = (current: PathMatch): void => {
    out.push(current);
    for (const child of children(current)) visit(child);
  };
  visit(match);
  return out;
}

function stepOn(step: PathStep, match: PathMatch): PathMatch[] {
  const { value, tokens } = match;
  switch (step.kind) {
    case "wildcard":
      return children(match);
    case "key":
      return value !== null && typeof value === "object" && !Array.isArray(value) && hasOwn(value, step.key)
        ? [{ tokens: [...tokens, step.key], value: value[step.key]! }]
        : [];
    case "index": {
      if (!Array.isArray(value)) return [];
      const index = step.index < 0 ? value.length + step.index : step.index;
      return index >= 0 && index < value.length ? [{ tokens: [...tokens, index], value: value[index]! }] : [];
    }
  }
}

/** This function gives the matches of a path in a value, in document order. */
export function queryPath(value: JsonValue, path: string): PathMatch[] {
  let matches: PathMatch[] = [{ tokens: [], value }];
  for (const step of parsePath(path)) {
    const next: PathMatch[] = [];
    for (const match of matches) {
      const sources = step.deep ? descendants(match) : [match];
      for (const source of sources) next.push(...stepOn(step, source));
    }
    matches = next;
  }
  return matches;
}
