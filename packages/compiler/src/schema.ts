/**
 * The check of an input against the JSON Schema of a procedure (the manifest gives draft-07).
 *
 * The compiler knows only a part of an input before the run: the literals, and the keys of an
 * object whose values are calls. This validator works on such a partial value (a shape). It
 * reports only a definite problem: a value that the compiler knows and that the schema refuses.
 * A part that the compiler does not know agrees with each schema.
 */

import { isPlainObject } from "@procedures/client/browser";
import { childPointer, type IRNode, type Pointer } from "./ir.js";

/** A partial value: what the compiler knows of a value before the run. */
export type Shape =
  | { readonly kind: "known"; readonly value: unknown; readonly pointer: Pointer }
  | { readonly kind: "unknown"; readonly pointer: Pointer }
  | { readonly kind: "object"; readonly entries: ReadonlyMap<string, Shape>; readonly pointer: Pointer }
  | { readonly kind: "array"; readonly items: readonly Shape[]; readonly pointer: Pointer };

/** The shape of the value of a node. */
export function shapeOf(node: IRNode): Shape {
  switch (node.kind) {
    case "literal":
      return { kind: "known", value: node.value, pointer: node.pointer };
    case "object":
      return { kind: "object", entries: new Map(node.entries.map((entry) => [entry.key, shapeOf(entry.value)])), pointer: node.pointer };
    case "array":
      return { kind: "array", items: node.items.map(shapeOf), pointer: node.pointer };
    default:
      return { kind: "unknown", pointer: node.pointer };
  }
}

/** The shape of an input with the parent context of control flow (`callOperand()`). */
export function withExtra(shape: Shape, extra: Readonly<Record<string, unknown>>): Shape {
  const keys = Object.keys(extra);
  if (keys.length === 0) return shape;
  const extraEntries = keys.map((key): [string, Shape] => [key, { kind: "known", value: extra[key], pointer: shape.pointer }]);
  switch (shape.kind) {
    case "object":
      return { kind: "object", entries: new Map([...shape.entries, ...extraEntries]), pointer: shape.pointer };
    case "known": {
      const value = shape.value;
      const base = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
      return { kind: "known", value: { ...base, ...extra }, pointer: shape.pointer };
    }
    case "array":
      return { kind: "known", value: { ...extra }, pointer: shape.pointer };
    case "unknown":
      return shape;
  }
}

/** One problem of an input. */
export interface SchemaIssue {
  /** The pointer of the part of the program. */
  readonly pointer: Pointer;
  /** The path in the input: `filter.status` or `items[2]`. */
  readonly path: string;
  readonly message: string;
}

type Schema = boolean | Record<string, unknown>;

/** The JSON type of a known value, or undefined for a value that JSON does not have. */
function jsonType(value: unknown): string | undefined {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return Number.isFinite(value) ? "number" : undefined;
    case "boolean":
      return "boolean";
    case "object":
      return isPlainObject(value) ? "object" : undefined;
    case "undefined":
      return "undefined";
    default:
      return undefined;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => Object.hasOwn(b, key) && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function pathText(path: readonly (string | number)[]): string {
  let text = "";
  for (const part of path) text += typeof part === "number" ? `[${part}]` : text === "" ? part : `.${part}`;
  return text;
}

/** The shape of a known value: an object or an array gives entries, so a problem has a path. */
function expand(shape: Shape): Shape {
  if (shape.kind !== "known") return shape;
  const value = shape.value;
  if (Array.isArray(value)) {
    return { kind: "array", items: value.map((item, index): Shape => ({ kind: "known", value: item, pointer: childPointer(shape.pointer, index) })), pointer: shape.pointer };
  }
  if (isPlainObject(value)) {
    return {
      kind: "object",
      entries: new Map(Object.entries(value).map(([key, item]): [string, Shape] => [key, { kind: "known", value: item, pointer: childPointer(shape.pointer, key) }])),
      pointer: shape.pointer,
    };
  }
  return shape;
}

/** The JSON type of a shape, or undefined when the compiler does not know it. */
function typeOfShape(shape: Shape): string | undefined {
  switch (shape.kind) {
    case "object":
      return "object";
    case "array":
      return "array";
    case "known":
      return jsonType(shape.value);
    case "unknown":
      return undefined;
  }
}

function typeMatches(actual: string, expected: unknown, value: unknown): boolean {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => type === actual || (type === "integer" && actual === "number" && Number.isInteger(value)) || (type === "number" && actual === "integer"));
}

class Validator {
  readonly issues: SchemaIssue[] = [];
  private depth = 0;

  constructor(private readonly root: Schema) {}

  private issue(shape: Shape, path: readonly (string | number)[], message: string): void {
    this.issues.push({ pointer: shape.pointer, path: pathText(path), message });
  }

  private resolve(ref: string): Schema | undefined {
    if (!ref.startsWith("#")) return undefined;
    let current: unknown = this.root;
    for (const part of ref.slice(1).split("/").filter((segment) => segment !== "")) {
      const key = decodeURIComponent(part).replace(/~1/g, "/").replace(/~0/g, "~");
      if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return typeof current === "boolean" || (typeof current === "object" && current !== null) ? (current as Schema) : undefined;
  }

  /** True when the shape agrees with the schema (no definite problem). The problems go to `issues`. */
  validate(shape: Shape, schema: Schema | undefined, path: readonly (string | number)[]): boolean {
    if (schema === undefined || schema === true) return true;
    if (schema === false) {
      if (shape.kind === "unknown") return true;
      this.issue(shape, path, "no value is valid here");
      return false;
    }
    if (shape.kind === "unknown") return true;
    if (this.depth > 50) return true;
    this.depth++;
    try {
      return this.validateObject(shape, schema, path);
    } finally {
      this.depth--;
    }
  }

  private branches(shape: Shape, schemas: unknown, path: readonly (string | number)[]): boolean {
    if (!Array.isArray(schemas)) return true;
    for (const branch of schemas) {
      const probe = new Validator(this.root);
      if (probe.validate(shape, branch as Schema, path)) return true;
    }
    return false;
  }

  private validateObject(shape: Shape, schema: Record<string, unknown>, path: readonly (string | number)[]): boolean {
    const before = this.issues.length;
    const ref = schema["$ref"];
    if (typeof ref === "string") {
      const target = this.resolve(ref);
      if (target !== undefined) this.validate(shape, target, path);
    }
    if (Array.isArray(schema["allOf"])) for (const part of schema["allOf"]) this.validate(shape, part as Schema, path);
    for (const key of ["anyOf", "oneOf"]) {
      if (schema[key] !== undefined && !this.branches(shape, schema[key], path)) {
        this.issue(shape, path, "the value agrees with none of the allowed forms");
      }
    }

    const actual = typeOfShape(shape);
    const value = shape.kind === "known" ? shape.value : undefined;
    if (actual === undefined) return this.issues.length === before;
    if (schema["type"] !== undefined && !typeMatches(actual, schema["type"], value)) {
      const expected = Array.isArray(schema["type"]) ? schema["type"].join(" or ") : String(schema["type"]);
      this.issue(shape, path, `expected ${expected}, got ${actual}`);
      return false;
    }
    if (shape.kind === "known" && actual !== "object" && actual !== "array") {
      if (Array.isArray(schema["enum"]) && !schema["enum"].some((option) => deepEqual(option, value))) {
        this.issue(shape, path, `expected one of ${schema["enum"].map((option) => JSON.stringify(option)).join(", ")}`);
      }
      if (Object.hasOwn(schema, "const") && !deepEqual(schema["const"], value)) {
        this.issue(shape, path, `expected ${JSON.stringify(schema["const"])}`);
      }
      if (actual === "string") this.string(shape, value as string, schema, path);
      if (actual === "number" || actual === "integer") this.number(shape, value as number, schema, path);
      return this.issues.length === before;
    }
    const expanded = expand(shape);
    if (expanded.kind === "object") this.properties(expanded, schema, path);
    if (expanded.kind === "array") this.items(expanded, schema, path);
    if (shape.kind === "known" && (Array.isArray(schema["enum"]) || Object.hasOwn(schema, "const"))) {
      const options = Array.isArray(schema["enum"]) ? schema["enum"] : [schema["const"]];
      if (!options.some((option) => deepEqual(option, value))) this.issue(shape, path, "the value is not one of the allowed values");
    }
    return this.issues.length === before;
  }

  private string(shape: Shape, value: string, schema: Record<string, unknown>, path: readonly (string | number)[]): void {
    const min = schema["minLength"];
    const max = schema["maxLength"];
    if (typeof min === "number" && value.length < min) this.issue(shape, path, `expected a string of ${min} characters or more`);
    if (typeof max === "number" && value.length > max) this.issue(shape, path, `expected a string of ${max} characters or fewer`);
    const pattern = schema["pattern"];
    if (typeof pattern === "string") {
      let regex: RegExp | undefined;
      try {
        regex = new RegExp(pattern);
      } catch {
        regex = undefined;
      }
      if (regex && !regex.test(value)) this.issue(shape, path, `expected a string that matches ${pattern}`);
    }
  }

  private number(shape: Shape, value: number, schema: Record<string, unknown>, path: readonly (string | number)[]): void {
    const minimum = schema["minimum"];
    const maximum = schema["maximum"];
    const exclusiveMinimum = schema["exclusiveMinimum"];
    const exclusiveMaximum = schema["exclusiveMaximum"];
    if (typeof minimum === "number" && (exclusiveMinimum === true ? value <= minimum : value < minimum)) {
      this.issue(shape, path, `expected a number ${exclusiveMinimum === true ? "greater than" : "of"} ${minimum}${exclusiveMinimum === true ? "" : " or more"}`);
    }
    if (typeof maximum === "number" && (exclusiveMaximum === true ? value >= maximum : value > maximum)) {
      this.issue(shape, path, `expected a number ${exclusiveMaximum === true ? "less than" : "of"} ${maximum}${exclusiveMaximum === true ? "" : " or less"}`);
    }
    if (typeof exclusiveMinimum === "number" && value <= exclusiveMinimum) this.issue(shape, path, `expected a number greater than ${exclusiveMinimum}`);
    if (typeof exclusiveMaximum === "number" && value >= exclusiveMaximum) this.issue(shape, path, `expected a number less than ${exclusiveMaximum}`);
    const multipleOf = schema["multipleOf"];
    if (typeof multipleOf === "number" && multipleOf > 0) {
      const quotient = value / multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-9) this.issue(shape, path, `expected a multiple of ${multipleOf}`);
    }
  }

  private properties(shape: Extract<Shape, { kind: "object" }>, schema: Record<string, unknown>, path: readonly (string | number)[]): void {
    const properties = isPlainObject(schema["properties"]) ? schema["properties"] : {};
    const present = (key: string): boolean => {
      const entry = shape.entries.get(key);
      return entry !== undefined && !(entry.kind === "known" && entry.value === undefined);
    };
    if (Array.isArray(schema["required"])) {
      for (const key of schema["required"]) {
        if (typeof key === "string" && !present(key)) this.issue(shape, [...path, key], "the input has no value for this required key");
      }
    }
    const patterns = isPlainObject(schema["patternProperties"]) ? Object.keys(schema["patternProperties"]) : [];
    const additional = schema["additionalProperties"];
    for (const [key, entry] of shape.entries) {
      if (entry.kind === "known" && entry.value === undefined) continue;
      if (Object.hasOwn(properties, key)) {
        this.validate(entry, properties[key] as Schema, [...path, key]);
        continue;
      }
      if (patterns.some((pattern) => safeTest(pattern, key))) continue;
      if (additional === false) this.issue(entry, [...path, key], "the schema does not allow this key");
      else if (typeof additional === "object" && additional !== null) this.validate(entry, additional as Schema, [...path, key]);
    }
  }

  private items(shape: Extract<Shape, { kind: "array" }>, schema: Record<string, unknown>, path: readonly (string | number)[]): void {
    const minItems = schema["minItems"];
    const maxItems = schema["maxItems"];
    if (typeof minItems === "number" && shape.items.length < minItems) this.issue(shape, path, `expected ${minItems} items or more`);
    if (typeof maxItems === "number" && shape.items.length > maxItems) this.issue(shape, path, `expected ${maxItems} items or fewer`);
    const prefix = Array.isArray(schema["prefixItems"]) ? schema["prefixItems"] : Array.isArray(schema["items"]) ? schema["items"] : undefined;
    const rest = prefix ? (Array.isArray(schema["items"]) ? schema["additionalItems"] : schema["items"]) : schema["items"];
    shape.items.forEach((item, index) => {
      const itemSchema = prefix && index < prefix.length ? prefix[index] : rest;
      if (itemSchema !== undefined) this.validate(item, itemSchema as Schema, [...path, index]);
    });
  }
}

function safeTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

/** This function gives the definite problems of a partial input against a JSON Schema. */
export function checkShape(shape: Shape, schema: unknown): SchemaIssue[] {
  if (schema === undefined || schema === null || (typeof schema !== "object" && typeof schema !== "boolean")) return [];
  const validator = new Validator(schema as Schema);
  validator.validate(shape, schema as Schema, []);
  return validator.issues;
}
