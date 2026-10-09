/**
 * The structural edits of the Composer: where a new call goes, wrapping a call in a chain, and
 * the slot that gets the focus after a removal.
 */

import {
  getAt,
  inputOf,
  isEmptyValue,
  isPlainObject,
  isProcRef,
  setAt,
  type Json,
  type Location,
  type ProcRef,
} from "./program";
import type { Field } from "../data/index.js";

/** The fields of a procedure (from the catalog), or null for a procedure without a list of fields. */
export type FieldsOf = (key: string) => Field[] | null;

/** One way to put a new call into the program. */
export interface InsertChoice {
  id: "replace" | "inside" | "append" | "wrap";
  label: string;
  /** A choice that removes a part of the program. */
  destructive: boolean;
  program: Json;
  /** The location of the new call, to select it. */
  select: Location;
}

/** The short name of a call: "add" for client.add, else the full key. */
export function shortName(ref: ProcRef): string {
  return ref.$proc[0] === "client" && ref.$proc.length === 2 ? ref.$proc[1]! : ref.$proc.join(".");
}

/** The list fields that hold operands: a new call goes to their end. */
const LIST_FIELDS = ["steps", "tasks", "values", "items"];

/** The first field of `target` that can take a new call, or undefined. */
function freeField(target: ProcRef, fields: Field[] | null): { field: string; append: boolean } | undefined {
  const input = inputOf(target);
  for (const name of LIST_FIELDS) {
    if (Array.isArray(input[name])) return { field: name, append: true };
  }
  const names = [
    ...(fields ?? []).filter((field) => !field.optional).map((field) => field.name),
    ...Object.keys(input),
  ];
  for (const name of names) {
    if (isEmptyValue(input[name])) return { field: name, append: false };
  }
  return undefined;
}

/** The first required field of a new call, where the old call goes when the new call wraps it. */
function wrapField(call: ProcRef, fields: Field[] | null): { field: string; list: boolean } | undefined {
  const input = inputOf(call);
  for (const name of LIST_FIELDS) {
    if (Array.isArray(input[name])) return { field: name, list: true };
  }
  const required = (fields ?? []).find((field) => !field.optional);
  return required ? { field: required.name, list: false } : undefined;
}

/**
 * The ways to put `call` at `location`. An empty slot or a simple value gets one choice (the
 * caller applies it at once). A call, or a list or object with content, gets the choices to
 * put the new call inside, to wrap the old value, or to replace it.
 */
export function insertChoices(program: Json, location: Location, call: ProcRef, fieldsOf: FieldsOf): InsertChoice[] {
  const target = getAt(program, location);
  const name = shortName(call);
  const replace = (destructive: boolean, label = `Replace it with ${name}`): InsertChoice => ({
    id: "replace",
    label,
    destructive,
    program: setAt(program, location, call),
    select: location,
  });

  if (target === undefined || isEmptyValue(target) || (!Array.isArray(target) && !isPlainObject(target))) {
    return [replace(false, `Put ${name} here`)];
  }

  const choices: InsertChoice[] = [];
  if (Array.isArray(target)) {
    const select = [...location, target.length];
    choices.push({ id: "append", label: `Add ${name} to the end of the list`, destructive: false, program: setAt(program, select, call), select });
  } else if (isProcRef(target)) {
    const targetName = shortName(target);
    const free = freeField(target, fieldsOf(target.$proc.join(".")));
    if (free) {
      const fieldLocation = [...location, "input", free.field];
      if (free.append) {
        const list = getAt(program, fieldLocation) as Json[];
        const select = [...fieldLocation, list.length];
        choices.push({
          id: "inside",
          label: `Add ${name} to ${targetName}.${free.field}`,
          destructive: false,
          program: setAt(program, select, call),
          select,
        });
      } else {
        choices.push({
          id: "inside",
          label: `Put ${name} in ${targetName}.${free.field}`,
          destructive: false,
          program: setAt(program, fieldLocation, call),
          select: fieldLocation,
        });
      }
    }
    const wrap = wrapField(call, fieldsOf(call.$proc.join(".")));
    if (wrap) {
      const wrapped: ProcRef = { ...call, input: { ...inputOf(call), [wrap.field]: wrap.list ? [target] : target } };
      choices.push({
        id: "wrap",
        label: `Put ${targetName} in ${name}.${wrap.field}`,
        destructive: false,
        program: setAt(program, location, wrapped),
        select: location,
      });
    }
  }
  choices.push(replace(true, `Replace ${isProcRef(target) ? shortName(target) : Array.isArray(target) ? "the list" : "the object"} with ${name}`));
  return choices;
}

/** The program with the call at `location` wrapped in a `client.chain` as its first step. */
export function wrapInChain(program: Json, location: Location): Json {
  const target = getAt(program, location);
  if (!isProcRef(target)) return program;
  return setAt(program, location, { $proc: ["client", "chain"], input: { steps: [target] } });
}

/**
 * The slot that gets the focus after the removal of the item `index` of the list at
 * `location`: the next item, else the item before it, else the list itself.
 */
export function focusAfterRemoval(location: Location, index: number, length: number): Location {
  if (index < length - 1) return [...location, index];
  if (index > 0) return [...location, index - 1];
  return location;
}
