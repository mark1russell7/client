/**
 * The text from outside a host: a web page, a mail, a file of a user (CLI-10).
 *
 * A procedure that gives such text declares the fields of its output that hold it
 * (`metadata.untrusted`). A face that gives text to a model (MCP) then shows that text apart from
 * the data. Envelopes tell the model that this text is data, not instructions. Another face gives
 * the output as it is.
 *
 * The invocation marks each output object of such a procedure (`markUntrusted()`). The mark goes
 * with the object, so the face also finds the text in the output of a caller: `client.chain`, a
 * procedure that `procedure.define` made, or a procedure of code that gives the object.
 */

import type { AnyProcedure } from "./types.js";

/** The values of the source of a text: the attributes of its envelope. */
export type UntrustedSource = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** A text from outside the host, with its source: for example the URL and the date of a page. */
export interface UntrustedText {
  readonly text: string;
  readonly source?: UntrustedSource | undefined;
}

/**
 * The value of an untrusted field of an output: a text, a text with its source, or a list of
 * them.
 */
export type UntrustedValue = string | UntrustedText | readonly (string | UntrustedText)[];

/** This function gives a text with its source, for an untrusted field of an output. */
export function untrustedText(text: string, source?: UntrustedSource): UntrustedText {
  return source === undefined ? { text } : { text, source };
}

/** The marked output objects, each with the names of its untrusted fields. */
const MARKS = new WeakMap<object, readonly string[]>();

/** The count of the marks of this process. While it is 0, no value holds a mark. */
let markCount = 0;

/**
 * This function marks the untrusted fields of one output object and gives the same object. The
 * mark goes with the object and does not change its value. Thus a face finds the mark when another
 * procedure gives the object, at any depth of its output. A value that is not an object gets no mark.
 */
export function markUntrusted<T>(value: T, fields: readonly string[]): T {
  if (fields.length === 0 || value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const known = MARKS.get(value);
  MARKS.set(value, known ? [...new Set([...known, ...fields])] : [...fields]);
  markCount++;
  return value;
}

/**
 * This function copies each mark of the objects of `from` to the object at the same path of `to`,
 * and gives `to`. A schema check makes new objects. Thus the checked output keeps the marks of the
 * output of the handler, also the marks of the output of another procedure in it.
 */
export function carryUntrustedMarks<T>(from: unknown, to: T): T {
  if (markCount === 0) return to;
  // A shared object of the source can have a copy at each of its paths: each pair gets one visit
  const seen = new WeakMap<object, WeakSet<object>>();
  const visit = (source: unknown, target: unknown): void => {
    if (source === null || typeof source !== "object" || target === null || typeof target !== "object") return;
    // The same object keeps its marks, and the marks of each object in it
    if (source === target) return;
    const targets = seen.get(source) ?? new WeakSet<object>();
    if (targets.has(target)) return;
    targets.add(target);
    seen.set(source, targets);
    if (Array.isArray(source)) {
      if (!Array.isArray(target)) return;
      const length = Math.min(source.length, target.length);
      for (let index = 0; index < length; index++) visit(source[index], target[index]);
      return;
    }
    if (Array.isArray(target)) return;
    const fields = MARKS.get(source);
    if (fields) markUntrusted(target, fields);
    for (const key of Object.keys(source)) {
      if (Object.hasOwn(target, key)) visit((source as Record<string, unknown>)[key], (target as Record<string, unknown>)[key]);
    }
  };
  visit(from, to);
  return to;
}

/** The names of the untrusted fields that the mark of an output object gives. Empty: no mark. */
export function untrustedMarkOf(value: unknown): readonly string[] {
  return value !== null && typeof value === "object" ? (MARKS.get(value) ?? []) : [];
}

/** The names of the output fields that hold untrusted text (`metadata.untrusted`). Empty: none. */
export function untrustedFieldsOf(procedure: AnyProcedure): readonly string[] {
  const fields = (procedure.metadata as { untrusted?: unknown } | undefined)?.untrusted;
  return Array.isArray(fields) ? fields.filter((field): field is string => typeof field === "string") : [];
}

/** The texts of the value of an untrusted field, each with its source. Another value gives none. */
export function untrustedTextsOf(value: unknown): UntrustedText[] {
  const one = (item: unknown): UntrustedText | undefined => {
    if (typeof item === "string") return { text: item };
    if (item !== null && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
      const { text, source } = item as { text: string; source?: unknown };
      return source !== null && typeof source === "object" ? { text, source: source as UntrustedSource } : { text };
    }
    return undefined;
  };
  const items = Array.isArray(value) ? value : [value];
  return items.map(one).filter((item): item is UntrustedText => item !== undefined);
}
