/**
 * The sub-programs of an exports manifest (d40-language-ops). A function parameter of a package,
 * for example the statistic of a bootstrap, gets one call of a pure procedure as data:
 *
 * ```json
 * { "$proc": ["statistics", "mean"], "input": { "values": { "$ref": "sample" } }, "$when": "$never" }
 * ```
 *
 * In a program, `"$when": "$never"` keeps the call as data until the package starts the function.
 * The loader compiles the call into a function that gives its value at once, as the package needs
 * it. The function uses only operators: the pure procedures of exports manifests that do not give
 * a promise. So a sub-program changes nothing, and it gives the same value for the same input.
 */

import * as z from "zod";
import {
  InvocationError,
  PROCEDURE_REGISTRY,
  pathToKey,
  resolveIn,
  type AnyProcedure,
  type ProcedureContext,
} from "@procedures/client/browser";
import { withDefinitions } from "./definitions.js";
import { jsonValue } from "./json.js";
import { PROGRAM_KEYWORD, type ExportsJsonSchema, type ExportsManifest, type ExportsProgram } from "./types.js";

type Definitions = ExportsManifest["$defs"];

/** A procedure that a sub-program can use: pure, from an exports manifest, and with no promise. */
export interface Operator {
  readonly path: readonly string[];
  /** The schema of the input of the procedure. */
  readonly input: z.ZodType;
  /** The JSON form of the value of the function for an input that agrees with `input`. */
  call(input: Record<string, unknown>): unknown;
}

/** The operators, by the handler of their procedure: a registry stores a copy with the same handler. */
const OPERATORS = new WeakMap<object, Operator>();

/** This function records the operator of a procedure handler. */
export function registerOperator(handler: object, operator: Operator): void {
  OPERATORS.set(handler, operator);
}

/** The operator of a procedure, or undefined when the procedure is not an operator. */
export function operatorOf(procedure: AnyProcedure | undefined): Operator | undefined {
  return procedure === undefined ? undefined : OPERATORS.get(procedure.handler as object);
}

/** The results of `reachesProgram()`, by schema: a schema object belongs to one manifest. */
const REACHES = new WeakMap<object, boolean>();

/** True when a schema has a sub-program, also through its definitions. */
export function reachesProgram(schema: unknown, defs: Definitions): boolean {
  if (schema === null || typeof schema !== "object") return false;
  const known = REACHES.get(schema);
  if (known !== undefined) return known;
  const seen = new Set<string>();
  const visit = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(visit);
    const record = node as Record<string, unknown>;
    if (PROGRAM_KEYWORD in record) return true;
    const name = definitionName(record);
    if (name !== undefined) {
      if (seen.has(name)) return false;
      seen.add(name);
      return visit(defs[name]);
    }
    return Object.values(record).some(visit);
  };
  const result = visit(schema);
  REACHES.set(schema, result);
  return result;
}

/**
 * This function gives the input of a procedure with a function in place of each sub-program. A
 * value at a sub-program position of the schema that is not a call stays as it is.
 *
 * The operators come from the registry of the caller (`ctx.registry`, or the global registry),
 * and the expose rule of the caller applies. An error in a sub-program is `VALIDATION_ERROR`.
 */
export async function withSubPrograms(
  value: unknown,
  schema: ExportsJsonSchema,
  defs: Definitions,
  path: readonly string[],
  ctx: ProcedureContext | undefined,
): Promise<unknown> {
  const registry = ctx?.registry ?? PROCEDURE_REGISTRY;
  const lookup = async (callee: readonly string[], at: string): Promise<Operator> => {
    const reached = ctx?.expose === undefined || ctx.expose([...callee]);
    const operator = reached ? operatorOf(await resolveIn(registry, [...callee])) : undefined;
    if (operator === undefined) {
      throw refusal(path, at, `calls ${pathToKey(callee)}, which is not an operator that this caller reaches. A sub-program calls only the pure procedures of exports manifests that give no promise`);
    }
    return operator;
  };
  const compile = (call: Record<string, unknown>, program: ExportsProgram, at: string): Promise<unknown> =>
    compileSubProgram(call, program, { defs, lookup, path, at });
  return bind(value, schema, defs, [], compile);
}

type Compile = (call: Record<string, unknown>, program: ExportsProgram, at: string) => Promise<unknown>;

/** The value with a function in place of each call at a sub-program position of the schema. */
async function bind(value: unknown, schema: unknown, defs: Definitions, at: readonly string[], compile: Compile): Promise<unknown> {
  const node = resolved(schema, defs);
  if (node === undefined) return value;
  const program = node[PROGRAM_KEYWORD] as ExportsProgram | undefined;
  if (program !== undefined) return isCall(value) ? compile(value, program, where(at)) : value;
  const anyOf = node["anyOf"];
  if (Array.isArray(anyOf)) {
    // A call goes to a branch that is a sub-program. Another value goes to the one branch that has one
    const branches = anyOf.map((branch) => resolved(branch, defs));
    const direct = branches.find((branch) => branch?.[PROGRAM_KEYWORD] !== undefined);
    if (direct !== undefined && isCall(value)) return compile(value, direct[PROGRAM_KEYWORD] as ExportsProgram, where(at));
    const reaching = anyOf.filter((branch) => reachesProgram(branch, defs));
    return reaching.length === 1 ? bind(value, reaching[0], defs, at, compile) : value;
  }
  if (Array.isArray(value)) {
    const prefix = Array.isArray(node["prefixItems"]) ? (node["prefixItems"] as unknown[]) : [];
    let copy: unknown[] | undefined;
    for (const [index, item] of value.entries()) {
      const itemSchema = index < prefix.length ? prefix[index] : node["items"];
      if (!reachesProgram(itemSchema, defs)) continue;
      const bound = await bind(item, itemSchema, defs, [...at, String(index)], compile);
      if (bound !== item) (copy ??= [...value])[index] = bound;
    }
    return copy ?? value;
  }
  if (value === null || typeof value !== "object") return value;
  const properties = (node["properties"] ?? {}) as Record<string, unknown>;
  const additional = node["additionalProperties"];
  let copy: Record<string, unknown> | undefined;
  for (const [key, item] of Object.entries(value)) {
    const propertySchema = Object.hasOwn(properties, key) ? properties[key] : additional;
    if (!reachesProgram(propertySchema, defs)) continue;
    const bound = await bind(item, propertySchema, defs, [...at, key], compile);
    if (bound !== item) (copy ??= { ...(value as Record<string, unknown>) })[key] = bound;
  }
  return copy ?? value;
}

/** What a sub-program needs from its procedure: the definitions, the operators and the names for an error. */
interface Context {
  readonly defs: Definitions;
  readonly lookup: (callee: readonly string[], at: string) => Promise<Operator>;
  readonly path: readonly string[];
  /** The property path of the sub-program in the input, for example `options.statistic`. */
  readonly at: string;
}

/** The value of a part of a sub-program for the arguments of its function. */
type Expression = (args: readonly unknown[]) => unknown;

/**
 * This function compiles a sub-program into the function that the package calls. It finds each
 * operator before the package starts, so an error in the program stops the call before the work.
 */
async function compileSubProgram(call: Record<string, unknown>, program: ExportsProgram, context: Context): Promise<(...args: unknown[]) => unknown> {
  const { $when, ...rest } = call;
  if ($when !== undefined && $when !== "$never") {
    throw refusal(context.path, context.at, `has the $when ${JSON.stringify($when)}. A sub-program is data until the package calls it, so its $when is "$never" or absent`);
  }
  const body = await expression(rest, program, context);
  const result = z.fromJSONSchema(withDefinitions(program.output, context.defs) as never);
  return (...args: unknown[]): unknown => {
    // A package can give more arguments than the parameters, as Array.prototype.map does
    const value = body(args.slice(0, program.params.length).map(jsonValue));
    if (value === null && program.undefinedForNull === true) return undefined;
    const checked = result.safeParse(value);
    if (!checked.success) {
      throw new InvocationError("VALIDATION_ERROR", `The sub-program at ${context.at} gives a result that its function refuses: ${issues(checked.error)}`, [...context.path]);
    }
    return checked.data;
  };
}

/** The expression of a part of a sub-program. `bind()` compiles only a call, so the root is one call. */
async function expression(node: unknown, program: ExportsProgram, context: Context): Promise<Expression> {
  if (Array.isArray(node)) {
    if (node.some(isCall)) throw refusal(context.path, context.at, "has an array of calls. In a program such an array is a chain, and a sub-program has no chain");
    const items: Expression[] = [];
    for (const item of node) items.push(await expression(item, program, context));
    return (args) => items.map((item) => item(args));
  }
  if (node === null || typeof node !== "object") return () => node;
  const record = node as Record<string, unknown>;
  if (Object.hasOwn(record, "$literal")) {
    const literal = record["$literal"];
    return () => literal;
  }
  if (typeof record["$ref"] === "string") return reference(record["$ref"], program, context);
  if (isCall(record)) {
    if (record["$when"] !== undefined) throw refusal(context.path, context.at, "has a call with a $when in it. Only the root of a sub-program has a $when");
    const operator = await context.lookup(record["$proc"] as readonly string[], context.at);
    const input = await expression(record["input"] ?? {}, program, context);
    const key = pathToKey(operator.path);
    return (args) => {
      const checked = operator.input.safeParse(input(args));
      if (!checked.success) {
        throw new InvocationError("VALIDATION_ERROR", `The sub-program at ${context.at} gives ${key} an input that its schema refuses: ${issues(checked.error)}`, [...context.path]);
      }
      return operator.call(checked.data as Record<string, unknown>);
    };
  }
  const entries: Array<readonly [string, Expression]> = [];
  for (const [key, value] of Object.entries(record)) entries.push([key, await expression(value, program, context)]);
  return (args) => Object.fromEntries(entries.map(([key, part]) => [key, part(args)]));
}

/** The expression of a `$ref`: a parameter of the function, and optional fields with dots between them. */
function reference(text: string, program: ExportsProgram, context: Context): Expression {
  // path-check: a $ref names a parameter and the fields of its value, not a procedure path
  const [name = "", ...fields] = text.split(".");
  const index = program.params.indexOf(name);
  if (index < 0) {
    const names = program.params.length ? `the parameters ${program.params.join(", ")}` : "no names: its function has no parameter";
    throw refusal(context.path, context.at, `reads the unknown name "${name}" in "${text}". It reads ${names}`);
  }
  return (args) => {
    let value = args[index];
    // Only the own fields of an object, as in the interpreter: a missing field is undefined
    for (const field of fields) {
      if (value === null || typeof value !== "object" || !Object.hasOwn(value, field)) return undefined;
      value = (value as Record<string, unknown>)[field];
    }
    return value;
  };
}

/** True when a value is a call: an object with a `$proc` list of names. */
function isCall(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proc = (value as Record<string, unknown>)["$proc"];
  return Array.isArray(proc) && proc.length > 0 && proc.every((segment) => typeof segment === "string");
}

/** The name of the definition that a schema refers to, or undefined. */
function definitionName(node: Record<string, unknown>): string | undefined {
  const ref = node["$ref"];
  return typeof ref === "string" && ref.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : undefined;
}

/** The schema itself, or the definition that it refers to. */
function resolved(schema: unknown, defs: Definitions): Record<string, unknown> | undefined {
  let node = schema;
  const seen = new Set<string>();
  while (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const name = definitionName(node as Record<string, unknown>);
    if (name === undefined || seen.has(name)) return node as Record<string, unknown>;
    seen.add(name);
    node = defs[name];
  }
  return undefined;
}

function where(at: readonly string[]): string {
  // path-check: a position in the input of the call, the property names of its value
  return at.length ? at.join(".") : "the input";
}

function refusal(path: readonly string[], at: string, problem: string): InvocationError {
  return new InvocationError("VALIDATION_ERROR", `The sub-program at ${at} ${problem}.`, [...path]);
}

function issues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.length ? issue.path.join(".") : "the value"}: ${issue.message}`).join("; ");
}
