/**
 * The display of run results.
 *
 * A result is not always JSON: it can hold NaN, Infinity, undefined, a Date or a Map.
 * `JSON.stringify` shows NaN as null and drops undefined, so a misspelled `$ref` looked like a
 * good result. This module shows each value as it is, and it stops after a budget of values,
 * so a large result does not stop the page.
 */

/** The values that `formatValue` shows before it writes "…". */
export const DISPLAY_BUDGET = 4000;

/** The values that `snapshot` copies for one input or output of the trace. */
export const SNAPSHOT_BUDGET = 1500;

const INLINE_WIDTH = 64;

/** The marker of `snapshot` for the values that it did not copy. */
export interface Truncated {
  $truncated: number;
}

export function isTruncated(value: unknown): value is Truncated {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as { $truncated?: unknown }).$truncated === "number"
  );
}

/** The text of a value that is not a container, or undefined for a container. */
function scalarText(value: unknown): string | undefined {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      if (Number.isNaN(value)) return "NaN";
      if (value === Infinity) return "Infinity";
      if (value === -Infinity) return "-Infinity";
      if (Object.is(value, -0)) return "-0";
      return String(value);
    case "bigint":
      return `${value}n`;
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return String(value);
    case "function":
      return `[function ${value.name || "anonymous"}]`;
    case "symbol":
      return value.toString();
    default:
      break;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : `Date(${value.toISOString()})`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof RegExp) return String(value);
  if (isTruncated(value)) return `… ${value.$truncated.toLocaleString("en")} more values`;
  return undefined;
}

/** The entries of a container: the items of a list, the keys of an object, a Map or a Set. */
function containerOf(value: object): { open: string; close: string; entries: Array<[string | null, unknown]> } {
  if (Array.isArray(value)) return { open: "[", close: "]", entries: value.map((item) => [null, item]) };
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const items = Array.from(value as unknown as ArrayLike<unknown>);
    return { open: `${value.constructor.name}(${items.length}) [`, close: "]", entries: items.map((item) => [null, item]) };
  }
  if (value instanceof Map) {
    return { open: `Map(${value.size}) {`, close: "}", entries: [...value.entries()].map(([key, item]) => [scalarText(key) ?? String(key), item]) };
  }
  if (value instanceof Set) return { open: `Set(${value.size}) [`, close: "]", entries: [...value].map((item) => [null, item]) };
  return { open: "{", close: "}", entries: Object.entries(value).map(([key, item]) => [JSON.stringify(key), item]) };
}

interface State {
  left: number;
  path: Set<object>;
}

function inline(value: unknown, state: State): string {
  const text = scalarText(value);
  if (text !== undefined) return text;
  const object = value as object;
  if (state.path.has(object)) return "[circular]";
  const { open, close, entries } = containerOf(object);
  if (entries.length === 0) return `${open}${close}`;
  state.path.add(object);
  const parts: string[] = [];
  for (const [key, item] of entries) {
    if (state.left-- <= 0) {
      parts.push("…");
      break;
    }
    parts.push(key === null ? inline(item, state) : `${key}: ${inline(item, state)}`);
  }
  state.path.delete(object);
  const brace = open.endsWith("{");
  return brace ? `${open} ${parts.join(", ")} ${close}` : `${open}${parts.join(", ")}${close}`;
}

function block(value: unknown, indent: string, state: State): string {
  const text = scalarText(value);
  if (text !== undefined) return text;
  const object = value as object;
  if (state.path.has(object)) return "[circular]";
  // The inline form uses its own budget: it only measures the width
  const flat = inline(value, { left: INLINE_WIDTH, path: new Set(state.path) });
  if (flat.length + indent.length <= INLINE_WIDTH && !flat.includes("…")) {
    state.left -= Math.max(1, containerOf(object).entries.length);
    return flat;
  }
  const { open, close, entries } = containerOf(object);
  const inner = indent + "  ";
  state.path.add(object);
  const lines: string[] = [];
  for (const [key, item] of entries) {
    if (state.left-- <= 0) {
      lines.push(`${inner}…`);
      break;
    }
    lines.push(key === null ? inner + block(item, inner, state) : `${inner}${key}: ${block(item, inner, state)}`);
  }
  state.path.delete(object);
  return `${open}\n${lines.join(",\n")}\n${indent}${close}`;
}

/**
 * A value as text: JSON for JSON values, and the JavaScript form for the others (NaN,
 * Infinity, undefined, a Date, a Map). After `budget` values, the text has "…".
 */
export function formatValue(value: unknown, budget: number = DISPLAY_BUDGET): string {
  return block(value, "", { left: budget, path: new Set() });
}

/** A short one-line form of a value, for the rows of the trace. */
export function previewValue(value: unknown, width: number = 48): string {
  const text = inline(value, { left: 40, path: new Set() });
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

/** The values that are not JSON in a result: "NaN", "Infinity" and "undefined". */
export function specialValues(value: unknown, budget: number = 20_000): Set<string> {
  const found = new Set<string>();
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length > 0 && budget-- > 0) {
    const item = stack.pop();
    if (item === undefined) found.add("undefined");
    else if (typeof item === "number" && !Number.isFinite(item)) found.add(Number.isNaN(item) ? "NaN" : "Infinity");
    else if (typeof item === "object" && item !== null && !seen.has(item) && !isTruncated(item)) {
      seen.add(item);
      if (Array.isArray(item)) stack.push(...item);
      else if (item instanceof Map) stack.push(...item.values());
      else if (item instanceof Set) stack.push(...item);
      else if (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null) {
        stack.push(...Object.values(item));
      }
    }
  }
  return found;
}

/**
 * A copy of a value that the trace can keep: later changes to the value do not change it. The
 * copy keeps NaN, Infinity and undefined. After `budget` values it puts a `Truncated` marker,
 * so a call with a large input does not use much memory. A value that a worker cannot send
 * (a function, a class instance) becomes its text.
 */
export function snapshot(value: unknown, budget: number = SNAPSHOT_BUDGET): unknown {
  const state = { left: budget };
  const copy = (item: unknown, path: Set<object>): unknown => {
    if (item === null || typeof item !== "object") {
      return typeof item === "function" || typeof item === "symbol" ? scalarText(item) : item;
    }
    if (path.has(item)) return "[circular]";
    if (item instanceof Date) return new Date(item.getTime());
    if (item instanceof Error || item instanceof RegExp) return scalarText(item);
    if (ArrayBuffer.isView(item)) return scalarText(item) ?? inline(item, { left: 64, path: new Set() });
    const isArray = Array.isArray(item);
    const isPlain = isArray || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null;
    if (!isPlain && !(item instanceof Map) && !(item instanceof Set)) return inline(item, { left: 64, path: new Set() });
    path.add(item);
    try {
      if (item instanceof Map || item instanceof Set) return inline(item, { left: 64, path: new Set() });
      if (isArray) {
        const out: unknown[] = [];
        for (let index = 0; index < item.length; index++) {
          if (state.left-- <= 0) {
            out.push({ $truncated: item.length - index } satisfies Truncated);
            break;
          }
          out.push(copy(item[index], path));
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      const entries = Object.entries(item);
      for (let index = 0; index < entries.length; index++) {
        const [key, child] = entries[index]!;
        if (state.left-- <= 0) {
          out["…"] = { $truncated: entries.length - index } satisfies Truncated;
          break;
        }
        Object.defineProperty(out, key, { value: copy(child, path), enumerable: true, writable: true, configurable: true });
      }
      return out;
    } finally {
      path.delete(item);
    }
  };
  return copy(value, new Set());
}
