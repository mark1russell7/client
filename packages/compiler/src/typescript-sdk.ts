/**
 * A typed TypeScript SDK from a manifest (roadmap R23).
 *
 * The manifest of a host has the JSON Schemas of each procedure. This module writes the source
 * of a TypeScript module from them:
 *
 * - One input type and one output type for each procedure.
 * - The interface `Sdk`, with one method for each procedure at `sdk.<namespace>.<name>`.
 * - The function `createSdk(client)`, whose methods call `client.call(path, input)`.
 *
 * The converter knows a part of JSON Schema. It knows objects with the `required` list, arrays,
 * strings, numbers, booleans, `null`, `enum`, `const`, `anyOf`, `oneOf` and `additionalProperties`.
 * It writes `unknown` for each other schema. The source has no imports, and it type-checks with
 * the strict options of this repository.
 */

import { MANIFEST_FORMAT, type ProcedureEntry, type ProcedureManifest } from "@procedures/client/browser";

/** The options of `toTypeScriptSdk()`. */
export interface TypeScriptSdkOptions {
  /** The text of the first comment of the module. The default names the manifest and its hash. */
  readonly header?: string | undefined;
}

type Schema = Record<string, unknown>;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isSchema(value: unknown): value is Schema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The name of a property in a type: an identifier as it is, else a string literal. */
function propertyName(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/** The key of a property in an object literal. The key `__proto__` sets the prototype, so it is a computed key. */
function literalKey(name: string): string {
  return name === "__proto__" ? '["__proto__"]' : propertyName(name);
}

/** The text of a comment: no end of the comment, and no line breaks. */
function commentText(text: string): string {
  return text.replace(/\*\//g, "*\\/").replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

/** The type of a JSON value in `const` or `enum`: a literal type, or `unknown` for an object. */
function literalType(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "unknown";
}

function union(types: readonly string[]): string {
  const unique = [...new Set(types)];
  if (unique.length === 0) return "never";
  if (unique.includes("unknown")) return "unknown";
  return unique.join(" | ");
}

/** True when an object schema has an empty `required` list, or none: then the input can be absent. */
function noRequired(schema: unknown): boolean {
  if (!isSchema(schema)) return false;
  if (schema["type"] !== "object") return false;
  const required = schema["required"];
  return !Array.isArray(required) || required.length === 0;
}

/**
 * This function gives the TypeScript type of a JSON Schema (draft-07). It knows objects, arrays,
 * strings, numbers, booleans, `null`, `enum`, `const`, `anyOf`, `oneOf` and `additionalProperties`.
 * Each other schema gives `unknown`. `indent` is the indentation of the lines of an object type.
 */
export function schemaToType(schema: unknown, indent: string = ""): string {
  if (schema === false) return "never";
  if (!isSchema(schema)) return "unknown";
  if ("const" in schema) return literalType(schema["const"]);
  const values = schema["enum"];
  if (Array.isArray(values)) return union(values.map(literalType));
  const variants = schema["anyOf"] ?? schema["oneOf"];
  if (Array.isArray(variants)) return union(variants.map((variant) => schemaToType(variant, indent)));
  const type = schema["type"];
  if (Array.isArray(type)) return union(type.map((name) => schemaToType({ ...schema, type: name }, indent)));
  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const items = schema["items"];
      return `Array<${Array.isArray(items) ? "unknown" : schemaToType(items, indent)}>`;
    }
    case "object":
      return objectType(schema, indent);
    default:
      return "unknown";
  }
}

function objectType(schema: Schema, indent: string): string {
  const properties = isSchema(schema["properties"]) ? Object.entries(schema["properties"]) : [];
  const required = new Set(Array.isArray(schema["required"]) ? schema["required"].filter((name): name is string => typeof name === "string") : []);
  const extra = schema["additionalProperties"];
  const inner = `${indent}  `;
  const lines: string[] = [];
  for (const [name, property] of properties) {
    const description = isSchema(property) && typeof property["description"] === "string" ? commentText(property["description"]) : "";
    if (description) lines.push(`${inner}/** ${description} */`);
    const optional = !required.has(name);
    lines.push(`${inner}${propertyName(name)}${optional ? "?" : ""}: ${schemaToType(property, inner)}${optional ? " | undefined" : ""};`);
  }
  // Absent additionalProperties: an object without properties is open, and an object with properties is closed
  const open = extra === true || (isSchema(extra) && Object.keys(extra).length === 0) || (extra === undefined && properties.length === 0);
  if (open) {
    lines.push(`${inner}[key: string]: unknown;`);
  } else if (isSchema(extra)) {
    // An index signature must agree with each property, so a schema with properties gets unknown
    lines.push(`${inner}[key: string]: ${properties.length === 0 ? schemaToType(extra, inner) : "unknown"};`);
  }
  if (lines.length === 0) return "Record<string, never>";
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** The PascalCase name of a path: the letters and digits of each segment. */
function pascalName(path: readonly string[]): string {
  const name = path
    .flatMap((segment) => segment.split(/[^A-Za-z0-9]+/))
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return name === "" || /^[0-9]/.test(name) ? `P${name}` : name;
}

/** A procedure of the SDK with the names of its types. */
interface SdkProcedure {
  readonly entry: ProcedureEntry;
  readonly input: string;
  readonly output: string;
  /** True: the input can be absent (an object schema with an empty `required` list, or a schema of any value). */
  readonly optionalInput: boolean;
  /** True: an absent input becomes `{}`. */
  readonly emptyObject: boolean;
}

/** A node of the tree of the paths: a procedure, the children, or both. */
interface PathNode {
  procedure: SdkProcedure | undefined;
  readonly children: Map<string, PathNode>;
}

function signature(procedure: SdkProcedure): string {
  return `(input${procedure.optionalInput ? "?" : ""}: ${procedure.input}) => Promise<${procedure.output}>`;
}

/** The members of a node in the interface `Sdk`. */
function interfaceMembers(node: PathNode, indent: string): string[] {
  const lines: string[] = [];
  for (const [segment, child] of node.children) {
    const description = child.procedure?.entry.description;
    if (description) lines.push(`${indent}/** ${commentText(description)} */`);
    lines.push(`${indent}readonly ${propertyName(segment)}: ${memberType(child, indent)};`);
  }
  return lines;
}

function memberType(node: PathNode, indent: string): string {
  const members = node.children.size > 0 ? `{\n${interfaceMembers(node, `${indent}  `).join("\n")}\n${indent}}` : undefined;
  if (!node.procedure) return members ?? "Record<string, never>";
  const fn = signature(node.procedure);
  return members ? `(${fn}) & ${members}` : fn;
}

/** The value of a node in `createSdk()`. */
function memberValue(node: PathNode, indent: string): string {
  const members =
    node.children.size > 0
      ? `{\n${[...node.children].map(([segment, child]) => `${indent}  ${literalKey(segment)}: ${memberValue(child, `${indent}  `)},`).join("\n")}\n${indent}}`
      : undefined;
  if (!node.procedure) return members ?? "{}";
  const procedure = node.procedure;
  const path = `[${procedure.entry.path.map((segment) => JSON.stringify(segment)).join(", ")}]`;
  const argument = procedure.emptyObject ? "input ?? {}" : "input";
  const fn = `(input${procedure.optionalInput ? "?" : ""}: ${procedure.input}): Promise<${procedure.output}> => call(${path}, ${argument})`;
  return members ? `withMembers(${fn}, ${members})` : fn;
}

function hasBoth(node: PathNode): boolean {
  if (node.procedure && node.children.size > 0) return true;
  return [...node.children.values()].some(hasBoth);
}

/**
 * This function writes the source of a typed TypeScript SDK for the procedures of a manifest.
 * The module exports an input type and an output type for each procedure, the interface `Sdk`,
 * the interface `SdkClient` and the function `createSdk()`.
 */
export function toTypeScriptSdk(manifest: ProcedureManifest, options: TypeScriptSdkOptions = {}): string {
  const entries = [...manifest.procedures].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const used = new Set<string>();
  const procedures = entries.map((entry): SdkProcedure => {
    let name = pascalName(entry.path);
    for (let suffix = 2; used.has(name); suffix++) name = `${pascalName(entry.path)}${suffix}`;
    used.add(name);
    const emptyObject = noRequired(entry.input);
    const anyInput = schemaToType(entry.input) === "unknown";
    return { entry, input: `${name}Input`, output: `${name}Output`, optionalInput: anyInput || emptyObject, emptyObject };
  });

  const root: PathNode = { procedure: undefined, children: new Map() };
  for (const procedure of procedures) {
    let node = root;
    for (const segment of procedure.entry.path) {
      let child = node.children.get(segment);
      if (!child) {
        child = { procedure: undefined, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.procedure = procedure;
  }

  const header =
    options.header ??
    `The typed SDK of ${procedures.length} procedures. @procedures/compiler wrote this file from the manifest ${manifest.hash} (${MANIFEST_FORMAT}). Do not edit it: write it again from the manifest.`;
  const out: string[] = [`/**`, ` * ${commentText(header)}`, ` */`, ""];

  for (const procedure of procedures) {
    const { entry } = procedure;
    out.push(`/** The input of \`${commentText(entry.key)}\`. */`);
    out.push(`export type ${procedure.input} = ${schemaToType(entry.input)};`, "");
    out.push(`/** The output of \`${commentText(entry.key)}\`. */`);
    out.push(`export type ${procedure.output} = ${schemaToType(entry.output)};`, "");
  }

  out.push(
    "/** A client that calls a procedure by its path: `ctx.client` of a procedure handler, or an adapter of a `Client`. */",
    "export interface SdkClient {",
    "  call(path: string[], input: unknown): Promise<unknown>;",
    "}",
    "",
    "/** The methods of the procedures, at `sdk.<namespace>.<name>`. */",
    `export interface Sdk {`,
    ...interfaceMembers(root, "  "),
    "}",
    "",
  );

  if (hasBoth(root)) {
    out.push(
      "/** This function gives a function with the members of a namespace (a path that is a procedure and a namespace). */",
      "function withMembers<F extends object, M extends object>(fn: F, members: M): F & M {",
      "  for (const [key, value] of Object.entries(members)) Object.defineProperty(fn, key, { value, enumerable: true });",
      "  return fn as F & M;",
      "}",
      "",
    );
  }

  out.push("/** This function gives the SDK: each method calls `client.call(path, input)`. */");
  if (procedures.length === 0) {
    // No method uses the client, and the strict options refuse an unused parameter
    out.push("export function createSdk(_client: SdkClient): Sdk {", "  return {};", "}", "");
  } else {
    out.push(
      "export function createSdk(client: SdkClient): Sdk {",
      "  const call = <T>(path: string[], input: unknown): Promise<T> => client.call(path, input) as Promise<T>;",
      `  return ${memberValue(root, "  ")};`,
      "}",
      "",
    );
  }
  return out.join("\n");
}
