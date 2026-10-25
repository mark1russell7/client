/**
 * Programs on the coeval kernel (coeval decisions D9, D10 and D13, roadmap item M14).
 *
 * A program runs as a run document of `@mark1russell7/coeval`. This module holds the parts that
 * are the program format's own:
 *
 * - The world of a program: a call kind for each procedure path (an open world), the kinds of
 *   the control-flow procedures with their parts and their names, and the kinds `lit`, `ref`,
 *   `program.data`, `program.record`, `program.deferred` and `program.fail`.
 * - The desugarer: it changes the `$proc` form into a run document. The rules of hydration
 *   (implicit chains, `$when`, `$literal`, the limits) decide the shape of the document.
 * - The runners of the kinds, and the boundary: each call is an effect, and the host does it
 *   with the client (`client.call`). Thus `invokeProcedure()` stays the authority for the
 *   admission, the validation, the interceptors and the exposure rules of each call.
 *
 * The kernel does the rest: the order of the parts, the names of a scope, the references, the
 * parts at the same time, the error values and the static check.
 */

import {
  type Context,
  type Effect,
  type EvalError,
  type Json,
  type Key,
  type Kind,
  type Machine,
  type Namespace,
  type Result,
  type RunInput,
  type RunPart,
  type ScopeRule,
  type Steps,
  type World,
  Failure,
  context as kernelContext,
  isEnvelope,
  ok,
  prepare,
  walk,
} from "@mark1russell7/coeval";
import {
  LITERAL_KEY,
  MAX_DATA_DEPTH,
  WHEN_NEVER,
  createRefScope,
  getRefWhen,
  isAnyProcedureRef,
  isControlFlowPath,
  isLiteral,
  isOutputRef,
  isPlainObject,
  normalizeRef,
  shouldExecuteRef,
  withScope,
  type AnyProcedureRef,
  type HydrateOptions,
  type HydrationEvent,
  type OutputRef,
  type ProcedureRefJson,
  type RefExecutor,
  type RefScope,
} from "./ref.js";
import type { ProcedurePath } from "./types.js";

// =============================================================================
// Names
// =============================================================================

/**
 * The name of the result of the step before, in the kernel. A chain binds it for each step after
 * the first step. The `$proc` form writes it as `{ $ref: "$last" }`.
 */
const LAST = "last";

/**
 * This function gives the key of a `$proc` name in the names of the kernel. The kernel name
 * `last` is the result of the step before, so a step with the name `last` gets the key `$last`
 * (and `$last` gets `$$last`). The change is one to one, so no two names get the same key.
 */
export function nameKey(name: string): string {
  return /^\$*last$/.test(name) ? `$${name}` : name;
}

/** This function gives the `$proc` name of a key of the kernel names (the inverse of `nameKey()`). */
export function nameOfKey(key: string): string {
  return /^\$+last$/.test(key) ? key.slice(1) : key;
}

/**
 * This function gives the names of the kernel for a scope of the `$proc` form. The outer scopes
 * come first, so an inner name wins. The innermost `last` wins too, as `lookupOutputRef()` reads it.
 */
export function namesOfScope(scope: RefScope | undefined): Record<string, unknown> {
  const chain: RefScope[] = [];
  for (let current = scope; current; current = current.parent) chain.unshift(current);
  const names: Record<string, unknown> = {};
  for (const frame of chain) {
    for (const [name, value] of frame.outputs) setOwn(names, nameKey(name), value);
    if (Object.hasOwn(frame, "last")) setOwn(names, LAST, frame.last);
  }
  return names;
}

/** This function gives a scope of the `$proc` form for the names of the kernel, for `withScope()`. */
export function scopeOfNames(names: Readonly<Record<string, unknown>>): RefScope {
  const scope = createRefScope();
  for (const key of Object.keys(names)) {
    if (key === LAST) scope.last = names[key];
    else scope.outputs.set(nameOfKey(key), names[key]);
  }
  return scope;
}

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  // An assignment to "__proto__" changes the prototype: that key needs an own property
  if (key === "__proto__") Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  else target[key] = value;
}

// =============================================================================
// The world of a program
// =============================================================================

/** The first keys of the kinds of the kernel and of this module. A procedure path that starts with one goes under `procs`. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(["lit", "ref", "program", "procs"]);

/** The kind of a call: its type is the path of the procedure, and its value is the input. Each envelope in the input is a part. */
const CALL_KIND: Kind = {
  verbs: { eval: "program.call" },
  parts: { shape: "deep" },
  side: "run",
  effects: "type",
  summary: "A call of a procedure. The type is the path of the procedure, and the value is the input.",
};

/**
 * The kind of a control-flow call: a call with the names that the procedure binds for its operands.
 * Its value is the input. An operand is one part (a document) or data. The procedure gets its input
 * raw, so any value fits.
 */
function controlKind(summary: string, scope?: readonly ScopeRule[]): Kind {
  return { ...CALL_KIND, ...(scope ? { scope } : {}), summary };
}

/** The control-flow procedures of `client`, with the parts and the names of their operands. */
const CONTROL_KINDS: Readonly<Record<string, Kind>> = {
  chain: controlKind(
    "Its steps, in order. A later step reads the result of a named step, and last reads the step before.",
    [
      { names: { headers: true }, in: [["steps", "*"]], sequential: true },
      { names: { fixed: [LAST] }, in: [["steps", "*"]], sequential: true },
    ],
  ),
  parallel: controlKind("Its tasks at the same time, with a limit."),
  conditional: controlKind("The condition, then only the branch that it selects."),
  tryCatch: controlKind("The try operand, and after an error the catch operand. The catch operand reads error.", [
    { names: { fixed: ["error"] }, in: [["catch"]] },
  ]),
  and: controlKind("Its values in order, until a value is falsy."),
  or: controlKind("Its values in order, until a value is truthy."),
  map: controlKind("The call fn for each item. fn reads item (or the name in as) and index.", [
    { names: { textAt: ["as"], otherwise: "item" }, in: [["fn"]] },
    { names: { fixed: ["index"] }, in: [["fn"]] },
  ]),
  reduce: controlKind(
    "The call fn for each item. fn reads acc, item and index, and its result is the next acc.",
    [{ names: { fixed: ["acc", "item", "index"] }, in: [["fn"]] }],
  ),
};

/** The namespace `client`: the control-flow kinds, and a call for each other procedure. */
const CLIENT_NAMESPACE: Namespace = { kinds: CONTROL_KINDS, fallback: CALL_KIND };

/**
 * The world of a program. It is open: each path that starts with a key that the world does not
 * have is a call. A path that starts with a key of the world goes under the namespace `procs`.
 */
export const PROGRAM_WORLD: World = {
  kinds: {
    lit: { verbs: { eval: "program.lit" }, summary: "A literal: its value is the result. Nothing in the value starts." },
    ref: { verbs: { eval: "program.ref" }, summary: "A name of the scope and its fields: [\"names\", name, ...fields]." },
    program: {
      kinds: {
        data: { verbs: { eval: "program.data" }, parts: { shape: "deep" }, summary: "A value with documents in it: each document gives its result in its place." },
        record: {
          verbs: { eval: "program.data" },
          parts: { shape: "map", of: "lit" },
          summary: "A record with the shape of an envelope: each field is a document or data.",
        },
        deferred: {
          verbs: { eval: "program.deferred" },
          parts: { shape: "deep" },
          summary: "A call that waits for its runner: it stays data, with its input evaluated.",
        },
        fail: { verbs: { eval: "program.fail" }, summary: "An error of the program. It fails when a run reaches it." },
        call: CALL_KIND,
      },
    },
    procs: { kinds: {}, fallback: CALL_KIND },
    client: CLIENT_NAMESPACE,
  },
  defaults: {},
  fallback: CALL_KIND,
};

/** The type of a call document for a procedure path. */
function callType(path: ProcedurePath): Json {
  if (!Array.isArray(path) || path.length === 0 || !path.every((key) => typeof key === "string")) return ["program", "call"];
  return RESERVED_KEYS.has(path[0]!) ? ["procs", ...path] : [...path];
}

// =============================================================================
// Documents and their origins
// =============================================================================

/** A run document. Its value can hold values of the host (a literal of a `Date`, a `Map` or a runtime ref). */
export interface ProgramDocument {
  readonly type: Json;
  readonly value: unknown;
  readonly name?: string;
  readonly own?: Readonly<Record<string, string>>;
}

/**
 * The origin of a document of the desugarer: the object of the `$proc` form, its JSON pointer
 * (RFC 6901) in the program, and the facts that the run needs about its position.
 */
export interface DocumentOrigin {
  /** The object of the program: a call, a `$ref`, or the input of a control-flow procedure. */
  readonly source: unknown;
  /** The JSON pointer of the source in the program. The empty string is the root. */
  readonly pointer: string;
  /** True when the position has a scope: a raw call then gets the scope (`withScope()`). */
  readonly scoped: boolean;
  /** For a call: the nearest call whose input holds it, in the same hydration. */
  readonly consumer?: AnyProcedureRef | undefined;
  /** For a `$ref` in the input of a deferred call: an unknown name stays data for the runner. */
  readonly deferred?: boolean | undefined;
  /** True for the `client.chain` call that an array of calls makes (an implicit chain). */
  readonly synthesized?: boolean | undefined;
  /** For a call: its path, its input and its `$name`, as `normalizeRef()` gives them. */
  readonly call?: { readonly path: ProcedurePath; readonly input: unknown; readonly $name?: string | undefined } | undefined;
}

const ORIGINS = new WeakMap<object, DocumentOrigin>();

/**
 * This function gives the document at a place of a run document, for example the place of an issue
 * of `check()` of coeval. A part that is the whole value of its document has the same place as its
 * document: the function gives the deepest document at the place.
 */
export function documentAt(doc: unknown, place: readonly Key[]): unknown {
  const want = place.map(String);
  let found: unknown;
  walk(PROGRAM_WORLD, doc, (visit) => {
    const here = visit.place.map(String);
    if (here.length > want.length || here.some((key, index) => key !== want[index])) return "skip";
    if (here.length === want.length) found = visit.doc;
    return undefined;
  });
  return found;
}

/** This function gives the origin of a document that the desugarer made, or undefined. */
export function originOf(doc: unknown): DocumentOrigin | undefined {
  return typeof doc === "object" && doc !== null ? ORIGINS.get(doc) : undefined;
}

function makeDoc(type: Json, value: unknown, origin?: DocumentOrigin, name?: string): ProgramDocument {
  const doc: ProgramDocument = name === undefined ? { type, value } : { type, value, name };
  if (origin) ORIGINS.set(doc, origin);
  return doc;
}

function lit(value: unknown, name?: string): ProgramDocument {
  return makeDoc("lit", value, undefined, name);
}

function failDoc(message: string, pointer: string): ProgramDocument {
  return makeDoc(["program", "fail"], message, { source: undefined, pointer, scoped: false });
}

/** The header name of a call: a step of a chain binds it. A name that is not a text, or the empty text, binds nothing. */
function headerName(name: unknown): string | undefined {
  return typeof name === "string" && name !== "" ? nameKey(name) : undefined;
}

/** This function gives the pointer of a child (RFC 6901). */
function childPointer(pointer: string, key: string | number): string {
  return `${pointer}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

// =============================================================================
// The desugarer: the $proc form to a run document
// =============================================================================

/** The settings of one desugaring: the rules of one hydration. */
export interface DesugarOptions {
  /** True for a procedure that takes its input raw (`rawInputRule()`). The default knows the control-flow paths. */
  readonly rawInput?: ((path: ProcedurePath) => boolean) | undefined;
  /** The context names of the runner (`HydrateOptions.contextStack`). */
  readonly contextStack?: readonly string[] | undefined;
  /** The most nested calls (`HydrateOptions.maxDepth`, default 10). */
  readonly maxDepth?: number | undefined;
  /** True when the hydration has a scope. Without a scope, a `$ref` object is data. */
  readonly scoped?: boolean | undefined;
  /**
   * True: the operands of a control-flow call in the program become documents too, for a static
   * check. The default (false) keeps them data: the procedure gets them raw, and it runs them.
   */
  readonly expand?: boolean | undefined;
}

interface Settings {
  readonly rawInput: (path: ProcedurePath) => boolean;
  readonly contextStack: readonly string[];
  readonly maxDepth: number;
  readonly scoped: boolean;
  readonly expand: boolean;
  /** The raw inputs that the desugarer expands now: an input that contains itself stays data. */
  readonly expanding: Set<object>;
  /** The pointer of a child. A run needs no pointers, so only a check (`expand`) makes them. */
  readonly pointer: (pointer: string, key: string | number) => string;
}

const NO_POINTER = (): string => "";

function settingsOf(options: DesugarOptions): Settings {
  return {
    rawInput: options.rawInput ?? isControlFlowPath,
    contextStack: options.contextStack ?? [],
    maxDepth: options.maxDepth ?? 10,
    scoped: options.scoped ?? false,
    expand: options.expand ?? false,
    expanding: new Set(),
    pointer: options.expand ? childPointer : NO_POINTER,
  };
}

/** The objects on the path from the root of the value, to find a cycle. */
interface Ancestors {
  readonly value: object;
  readonly up: Ancestors | undefined;
}

/** The state of the walk at one value. */
interface Walk {
  readonly settings: Settings;
  /** True in the input of a call: there an array of calls is a list, not an implicit chain. */
  readonly skipImplicitChain: boolean;
  /** True in the input of a deferred call. */
  readonly deferred: boolean;
  /** The calls around the value in this hydration. */
  readonly refDepth: number;
  /** The levels around the value. */
  readonly dataDepth: number;
  readonly ancestors: Ancestors | undefined;
  /** The nearest call around the value. */
  readonly consumer: AnyProcedureRef | undefined;
  readonly pointer: string;
}

/**
 * The result of the desugarer for one value:
 *
 * - `doc`: a document.
 * - `template`: a plain object or an array with documents in it. A value of the kind
 *   `program.data` or of a call holds it as it is: the shape `deep` finds each document in it.
 * - `data`: a value that stays as it is (the same object).
 */
type Out =
  | { readonly doc: ProgramDocument }
  | { readonly template: unknown }
  | {
      readonly data: unknown;
      /** True when the data holds an object with the shape of an envelope: in a document, it must be a literal. */
      readonly shaped: boolean;
    };

function rootWalk(settings: Settings, pointer: string): Walk {
  return { settings, skipImplicitChain: false, deferred: false, refDepth: 0, dataDepth: 0, ancestors: undefined, consumer: undefined, pointer };
}

/** This function tells if a value holds an object with the shape of an envelope, through its plain objects and arrays. */
function holdsEnvelopeShape(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const seen = new Set<object>();
  const stack: Array<{ readonly item: unknown; readonly depth: number }> = [{ item: value, depth: 0 }];
  while (stack.length > 0) {
    const { item, depth } = stack.pop()!;
    if (item === null || typeof item !== "object" || seen.has(item)) continue;
    if (depth > MAX_DATA_DEPTH) return true;
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) stack.push({ item: child, depth: depth + 1 });
    } else if (isPlainObject(item)) {
      if (isEnvelope(item)) return true;
      for (const key of Object.keys(item)) stack.push({ item: item[key], depth: depth + 1 });
    }
  }
  return false;
}

/** Data that stays as it is (the same object). */
function keep(value: unknown): Out {
  return { data: value, shaped: holdsEnvelopeShape(value) };
}

/** The form of a value in a value of the shape `deep`: data with the shape of an envelope becomes a literal. */
function embed(out: Out): unknown {
  if ("doc" in out) return out.doc;
  if ("template" in out) return out.template;
  return out.shaped ? lit(out.data) : out.data;
}

/** The form of a value as one part: a template becomes a document of the kind `program.data`. */
function embedPart(out: Out): unknown {
  return "template" in out ? makeDoc(["program", "data"], out.template) : embed(out);
}

/** The form of a value as one part, also for data: data becomes a literal. */
function asPart(out: Out): unknown {
  return "data" in out ? lit(out.data) : embedPart(out);
}

/** The value of a call document for an input: `null` for a call without input, else the input. */
function inputValue(input: unknown, out: Out): unknown {
  if (input === undefined) return null;
  if ("data" in out && out.data === null) return lit(null);
  return embed(out);
}

function child(walk: Walk, parent: object, key: string | number): Walk {
  return { ...walk, dataDepth: walk.dataDepth + 1, ancestors: { value: parent, up: walk.ancestors }, pointer: walk.settings.pointer(walk.pointer, key) };
}

/**
 * This function desugars one value of a hydration (`hydrateValue()` of the interpreter before
 * October 2026, with the same rules).
 */
function desugarValue(value: unknown, walk: Walk): Out {
  if (value === null || typeof value !== "object") return { data: value, shaped: false };
  if (walk.dataDepth > MAX_DATA_DEPTH) {
    return { doc: failDoc(`Hydration failed: the input has more than ${MAX_DATA_DEPTH} levels of nesting`, walk.pointer) };
  }
  for (let current = walk.ancestors; current; current = current.up) {
    if (current.value === value) return { doc: failDoc("Hydration failed: the input is cyclic (an object contains itself)", walk.pointer) };
  }
  if (isLiteral(value)) return { doc: lit(value.$literal) };
  if (isOutputRef(value)) return walk.settings.scoped ? { doc: refDoc(value, walk) } : keep(value);
  if (isAnyProcedureRef(value)) return desugarRef(value, walk);
  if (Array.isArray(value)) {
    // An array of calls that all start now is an implicit chain (PROGRAM-FORMAT section 7)
    if (
      !walk.skipImplicitChain &&
      value.length > 0 &&
      value.every((item) => isAnyProcedureRef(item) && shouldExecuteRef(item, [...walk.settings.contextStack], false))
    ) {
      const chain: ProcedureRefJson = { $proc: ["client", "chain"], input: { steps: value } };
      return desugarRef(chain, { ...walk, skipImplicitChain: true }, true);
    }
    return combine(value, undefined, walk);
  }
  // Values that are not plain data (a Date, a Map, a typed array, an instance of a class) stay the same object
  if (!isPlainObject(value)) return { data: value, shaped: false };
  return combine(value, Object.keys(value), walk);
}

/** The result of an item that is not an object: the item is its own value. */
const PRIMITIVE: Out = { data: undefined, shaped: false };

/**
 * This function desugars the items of an array (no keys) or the fields of an object, and makes
 * their template. A subtree without a document stays the same object.
 */
function combine(original: object, keys: readonly string[] | undefined, walk: Walk): Out {
  const source = original as Readonly<Record<string | number, unknown>>;
  const length = keys ? keys.length : (original as readonly unknown[]).length;
  const outs = new Array<Out>(length);
  let documents = false;
  let shaped = false;
  for (let index = 0; index < length; index += 1) {
    const key = keys ? keys[index]! : index;
    const item = source[key];
    if (item === null || typeof item !== "object") {
      outs[index] = PRIMITIVE;
      continue;
    }
    const out = desugarValue(item, child(walk, original, key));
    outs[index] = out;
    if (!("data" in out)) documents = true;
    else if (out.shaped) shaped = true;
  }
  if (!documents) return { data: original, shaped: shaped || isEnvelope(original) };
  const itemAt = (index: number, form: (out: Out) => unknown): unknown => {
    const out = outs[index]!;
    return out === PRIMITIVE ? source[keys ? keys[index]! : index] : form(out);
  };
  if (!keys) return { template: Array.from(outs, (_, index) => itemAt(index, embed)) };
  const template: Record<string, unknown> = {};
  keys.forEach((key, index) => setOwn(template, key, itemAt(index, embed)));
  if (!isEnvelope(template)) return { template };
  // An object with the shape of an envelope is a record document: each field is one part
  const record: Record<string, unknown> = {};
  keys.forEach((key, index) => setOwn(record, key, itemAt(index, embedPart)));
  return { doc: makeDoc(["program", "record"], record) };
}

/** This function makes the document of a `$ref` in a scope. */
function refDoc(value: OutputRef, walk: Walk): ProgramDocument {
  const [first = "", ...fields] = value.$ref.split(".");
  const name = first === "$last" ? LAST : nameKey(first);
  // A run reads the origin only in the input of a deferred call. A check reads its pointer.
  const origin = walk.deferred || walk.settings.expand ? { source: value, pointer: walk.pointer, scoped: true, deferred: walk.deferred } : undefined;
  return makeDoc("ref", ["names", name, ...fields], origin);
}

/** This function desugars a call of a hydration (`hydrateRef()` of the interpreter before October 2026). */
function desugarRef(value: AnyProcedureRef, walk: Walk, synthesized = false): Out {
  // $never: data, with its whole subtree
  if (getRefWhen(value) === WHEN_NEVER) return keep(value);
  if (walk.refDepth >= walk.settings.maxDepth) {
    return { doc: failDoc(`Hydration depth exceeded maximum of ${walk.settings.maxDepth}`, walk.pointer) };
  }
  const ref = normalizeRef(value);
  const raw = walk.settings.rawInput(ref.path);
  const inputWalk = (deferred: boolean): Walk => ({
    ...walk,
    skipImplicitChain: true,
    deferred,
    refDepth: walk.refDepth + 1,
    dataDepth: walk.dataDepth + 1,
    ancestors: { value, up: walk.ancestors },
    consumer: value,
    pointer: walk.settings.pointer(walk.pointer, "input"),
  });
  const origin: DocumentOrigin = {
    source: value,
    pointer: walk.pointer,
    scoped: walk.settings.scoped,
    consumer: walk.consumer,
    call: ref,
    ...(synthesized ? { synthesized } : {}),
  };

  // A call that waits for its runner ($parent, or a context name that the runner did not give) is data
  if (!shouldExecuteRef(value, [...walk.settings.contextStack], false)) {
    if (raw) return keep(value);
    const input = desugarValue(ref.input, inputWalk(true));
    if ("data" in input) return keep(value);
    return { doc: makeDoc(["program", "deferred"], { input: embed(input) }, origin) };
  }
  if (raw) {
    // The steps of an implicit chain are the array of the program itself
    const at = synthesized ? (key: string) => (key === "steps" ? walk.pointer : walk.settings.pointer(walk.pointer, key)) : undefined;
    return { doc: makeDoc(callType(ref.path), rawValue(ref, walk.settings, origin.pointer, at), origin, headerName(ref.$name)) };
  }
  const input = desugarValue(ref.input, inputWalk(false));
  return { doc: makeDoc(callType(ref.path), inputValue(ref.input, input), origin, headerName(ref.$name)) };
}

/**
 * The value of a call of a procedure that takes its input raw. The procedure gets the input of
 * the program, so the value is data. For a check (`expand`), the operands of a control-flow
 * procedure become documents, with the names that the procedure binds.
 */
function rawValue(
  ref: { readonly path: ProcedurePath; readonly input: unknown },
  settings: Settings,
  pointer: string,
  inputPointer: (key: string) => string = (key) => settings.pointer(settings.pointer(pointer, "input"), key),
): unknown {
  if (ref.input === undefined) return null;
  const input = ref.input;
  if (settings.expand && typeof input === "object" && input !== null && !settings.expanding.has(input)) {
    settings.expanding.add(input);
    try {
      const value = isControlFlowPath(ref.path)
        ? controlValue(ref.path[1]!, input, settings, inputPointer)
        : ref.path.length === 2 && ref.path[0] === "client" && ref.path[1] === "eval"
          ? evalValue(input, settings, pointer)
          : undefined;
      if (value !== undefined) return value;
    } finally {
      settings.expanding.delete(input);
    }
  }
  return lit(input);
}

/**
 * The value of a call of `client.eval` for a check (`expand`). When its `procedure` is a path or a
 * call, `client.eval` starts one operand call in the scope of the caller: its input is a new
 * hydration. The function gives that input as documents, at the pointer of the input of the operand call.
 */
function evalValue(input: object, settings: Settings, pointer: string): Record<string, unknown> | undefined {
  if (!isPlainObject(input)) return undefined;
  const procedure = input["procedure"];
  const evalInput = input["input"];
  let operandInput: unknown;
  if (Array.isArray(procedure) && procedure.every((key) => typeof key === "string")) {
    operandInput = evalInput;
  } else if (isAnyProcedureRef(procedure) && !isOutputRef(procedure)) {
    // The input of eval goes over the input of the ref, for objects
    const refInput = normalizeRef(procedure).input;
    operandInput =
      evalInput === undefined ? refInput : isPlainObject(refInput) && isPlainObject(evalInput) ? { ...refInput, ...evalInput } : evalInput;
  } else {
    return undefined;
  }
  const value: Record<string, unknown> = {};
  for (const key of Object.keys(input)) setOwn(value, key, embed(keep(input[key])));
  // The input of the operand call is at the pointer of the input of eval
  const at = childPointer(childPointer(pointer, "input"), "input");
  setOwn(value, "input", embedPart(desugarValue(operandInput, rootWalk(settings, at))));
  return value;
}

/**
 * This function desugars an operand of a control-flow procedure (`evaluateOperand()`): a call is
 * an operand call (only `$never` holds it back, and its input is a new hydration), and another
 * value is a new hydration.
 */
function desugarOperand(value: unknown, settings: Settings, pointer: string): Out {
  if (!isAnyProcedureRef(value)) return desugarValue(value, rootWalk(settings, pointer));
  const ref = normalizeRef(value);
  const name = headerName(ref.$name);
  if (getRefWhen(value) === WHEN_NEVER) return { doc: lit(value, name) };
  return { doc: operandCall(value, settings, pointer, name) };
}

/** This function makes the document of a call whose input is a new hydration: an operand call, or the root call of a program. */
function operandCall(value: AnyProcedureRef, settings: Settings, pointer: string, name?: string): ProgramDocument {
  const ref = normalizeRef(value);
  const origin: DocumentOrigin = { source: value, pointer, scoped: settings.scoped, call: ref };
  if (settings.rawInput(ref.path)) return makeDoc(callType(ref.path), rawValue(ref, settings, pointer), origin, name);
  const inputPointer = settings.pointer(pointer, "input");
  return makeDoc(callType(ref.path), inputValue(ref.input, desugarValue(ref.input, rootWalk(settings, inputPointer))), origin, name);
}

/** The items of `client.map` and `client.reduce`: an array gives each item as its own hydration. */
function itemsOperand(items: unknown, settings: Settings, pointer: string): unknown {
  if (!Array.isArray(items)) return embedPart(desugarValue(items, rootWalk(settings, pointer)));
  return makeDoc(
    ["program", "data"],
    items.map((item, index) => embed(desugarValue(item, rootWalk(settings, settings.pointer(pointer, index))))),
  );
}

/**
 * This function desugars the input of a control-flow procedure: its operands become documents,
 * and the other fields stay data. It gives undefined when the input does not have the shape of
 * the procedure. The operands of a procedure without a scope have no scope (`scopeOf()`), except
 * the operands that the procedure gives names: the steps of a chain, `catch` and `fn`.
 */
export function desugarControlValue(name: string, input: unknown, options: DesugarOptions = {}): Record<string, unknown> | undefined {
  const settings = settingsOf(options);
  return controlValue(name, input, settings, (key) => settings.pointer("", key));
}

/**
 * The input of a control-flow procedure with its operands as documents. `at` gives the pointer of
 * a field of the input: for an implicit chain, the steps are the array of the program itself.
 */
function controlValue(name: string, input: unknown, settings: Settings, at: (key: string) => string): Record<string, unknown> | undefined {
  if (!isPlainObject(input)) return undefined;
  const outer = settings;
  const inner: Settings = { ...settings, scoped: true };
  const operands = new Map<string, unknown>();
  // An operand that a procedure starts as an operand: a call is an operand call (`evaluateOperand()`)
  const put = (key: string, scope: Settings): void => {
    if (Object.hasOwn(input, key)) operands.set(key, embedPart(desugarOperand(input[key], scope, at(key))));
  };
  // An operand that a procedure hydrates as a value (`hydrateOperand()`): a call in it is a call of a hydration
  const hydrated = (key: string, scope: Settings): void => {
    if (Object.hasOwn(input, key)) operands.set(key, embedPart(desugarValue(input[key], rootWalk(scope, at(key)))));
  };
  const list = (key: string, scope: Settings): boolean => {
    const items = input[key];
    if (!Array.isArray(items)) return false;
    // Each item of a list is one part, so the names of a sequence count each step
    operands.set(key, items.map((item, index) => asPart(desugarOperand(item, scope, scope.pointer(at(key), index)))));
    return true;
  };
  switch (name) {
    case "chain":
      if (!list("steps", inner)) return undefined;
      hydrated("initialInput", inner);
      break;
    case "parallel":
      if (!list("tasks", outer)) return undefined;
      break;
    case "conditional":
      for (const key of ["condition", "then", "else"]) put(key, outer);
      break;
    case "tryCatch":
      put("try", outer);
      put("catch", inner);
      break;
    case "and":
    case "or":
      if (!list("values", outer)) return undefined;
      break;
    case "map":
    case "reduce":
      if (Object.hasOwn(input, "items")) operands.set("items", itemsOperand(input["items"], outer, at("items")));
      if (name === "reduce") {
        hydrated("initial", outer);
        hydrated("accumulated", outer);
      } else if (typeof input["as"] === "string") {
        operands.set("as", nameKey(input["as"]));
      }
      put("fn", inner);
      break;
    default:
      return undefined;
  }
  // The other fields are data: a field with the shape of an envelope becomes a literal
  const value: Record<string, unknown> = {};
  for (const key of Object.keys(input)) setOwn(value, key, operands.has(key) ? operands.get(key) : embed(keep(input[key])));
  return value;
}

/** This function desugars a value of a hydration: the root of `hydrateInput()`. Data gives undefined. */
export function desugarInput(input: unknown, options: DesugarOptions = {}): ProgramDocument | undefined {
  const out = desugarValue(input, rootWalk(settingsOf(options), ""));
  if ("data" in out) return undefined;
  return "doc" in out ? out.doc : makeDoc(["program", "data"], out.template);
}

/**
 * This function desugars a program: the root call of `client.exec()` (`prepareRootCall()`). A
 * `$when` on the root call does not apply: the caller starts the root call now. Its input is a new
 * hydration.
 */
export function desugarProgram(program: AnyProcedureRef, options: DesugarOptions = {}): ProgramDocument {
  return operandCall(program, settingsOf(options), "", headerName(normalizeRef(program).$name));
}

// =============================================================================
// The runners
// =============================================================================

/** Where a call is: the root call of a program, an operand of control flow, or a call in an input. */
export type CallPosition = "root" | "operand" | "nested";

/**
 * The frame that a document gets in the root `self` of its context. Control flow gives it to an
 * operand call, and a program to its root call. Each other document gives its parts no frame.
 */
interface CallFrame {
  readonly position: "root" | "operand";
  /** The parent context (`cwd`, `node`) that control flow adds to the input of an operand call. */
  readonly extra: Readonly<Record<string, unknown>>;
  /** With `passThrough`, the result of the step before: the input of a step without input. */
  readonly passed?: { readonly value: unknown } | undefined;
}

/** The payload of the effect of a call. */
export interface CallEffect {
  readonly position: CallPosition;
  /** The input of the call: hydrated, or raw with the scope of the caller. */
  readonly input: unknown;
  /** The call object of the program. */
  readonly source: unknown;
  /** The nearest call whose input holds the call (for `HydrationEvent.consumer`). */
  readonly consumer: AnyProcedureRef | undefined;
}

/** What a machine of programs needs from its host. */
export interface ProgramHost {
  /** True for a procedure that takes its input raw. The procedure in the registry decides at the time of the call. */
  readonly rawInput: (path: ProcedurePath) => boolean;
  /** True: the documents of a value start at the same time (`HydrateOptions.parallel`). */
  readonly parallel?: boolean | undefined;
}

const ROOT_FRAME: CallFrame = { position: "root", extra: {} };
const NO_EXTRA: Readonly<Record<string, unknown>> = {};

function frameOf(self: unknown): CallFrame | undefined {
  return typeof self === "object" && self !== null && "position" in self ? (self as CallFrame) : undefined;
}

/** The context of the parts of a document: the parts get no frame. */
function partContext(context: Context): Context {
  return context.self === null ? context : { ...context, self: null };
}

/** The parent context that the control-flow procedures give to their operand calls. */
export function parentContext(input: { cwd?: unknown; node?: unknown }): Record<string, unknown> {
  return {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.node ? { node: input.node } : {}),
  };
}

/** The value that a failed result throws at the boundary: the error of the host, or an error with the reason. */
export function thrownValue(error: EvalError): unknown {
  return error.cause !== undefined ? error.cause : new Error(error.reason);
}

/**
 * This function gives the error that a call of the host gives the kernel. Since coeval 0.6.3, the kernel gives a `Failure`
 * of the host its own error value, without a cause. Thus a new `Failure` with the same error value
 * keeps the original as its cause. `thrownValue()` then gives the same object, as for each other
 * error of a procedure (and as with coeval 0.5).
 */
function hostError(error: unknown): unknown {
  return error instanceof Failure ? new Failure({ ...error.error, cause: error }) : error;
}

/** This function does a call of the host. It changes a `Failure` that the call throws, or that its promise rejects with (`hostError()`). */
function hostCall(start: () => unknown): unknown {
  let done: unknown;
  try {
    done = start();
  } catch (error) {
    throw hostError(error);
  }
  return done instanceof Promise ? done.catch((error: unknown) => Promise.reject(hostError(error))) : done;
}

/** The message of a failed result, as the control-flow procedures read an error. */
function messageOf(error: EvalError): string {
  const value = thrownValue(error);
  return value instanceof Error ? value.message : String(value);
}

/** The values of the parts, one after the other or at the same time. It stops at the first failure. */
function* evaluateParts(
  parts: readonly RunPart[],
  context: Context,
  all: RunInput["all"],
  parallel: boolean,
): Generator<Promise<unknown>, { readonly values: unknown[] } | { readonly failure: Result }, unknown> {
  const values: unknown[] = [];
  if (!parallel || parts.length < 2) {
    for (const part of parts) {
      const result = yield* part.evaluate(context);
      if (!result.ok) return { failure: result };
      values.push(result.value);
    }
    return { values };
  }
  let first: Result | undefined;
  const results = yield* all(
    parts.map((part) => ({
      key: part.key,
      path: part.path,
      *evaluate(): Steps {
        const result = yield* part.evaluate(context);
        if (!result.ok) first ??= result;
        return result;
      },
    })),
    { failFast: true },
  );
  if (first) return { failure: first };
  for (const result of results) values.push((result as { readonly value: unknown }).value);
  return { values };
}

/** The truth of a condition of `client.conditional`: the `value` field of an object decides. */
function conditionTruth(condition: unknown): boolean {
  if (condition && typeof condition === "object" && "value" in condition) return Boolean((condition as { value: unknown }).value);
  return Boolean(condition);
}

/** The source of a document: the input of a control-flow procedure (the raw input that its handler got). */
function sourceOf(input: RunInput): Record<string, unknown> {
  const source = originOf(input.doc)?.source;
  return isPlainObject(source) ? source : {};
}

/**
 * The operands of a control-flow document. Its value holds each operand in its place: a part (a
 * document), or data. An absent operand is `undefined`.
 */
interface Operands {
  /** The operand at a key of the value. */
  at(key: string): unknown;
  /** The operands of a list at a key of the value. */
  list(key: string): readonly unknown[];
  /** The value of an operand: a part runs in the context, and data is its own value. */
  run(operand: unknown, context: Context): Steps;
}

function operandsOf(input: RunInput): Operands {
  const parts = new Set<unknown>(input.parts);
  const value = isPlainObject(input.value) ? input.value : {};
  return {
    at: (key) => (Object.hasOwn(value, key) ? value[key] : undefined),
    list: (key) => (Array.isArray(value[key]) ? (value[key] as unknown[]) : []),
    *run(operand, context) {
      if (parts.has(operand)) return yield* (operand as RunPart).evaluate(context);
      return ok(operand);
    },
  };
}

/** The context of an operand: an operand call gets a call frame, another operand no frame. */
function operandContext(context: Context, names: Readonly<Record<string, unknown>>, source: unknown, extra: Readonly<Record<string, unknown>>, passed?: { readonly value: unknown }): Context {
  const self: CallFrame | null = isAnyProcedureRef(source) ? { position: "operand", extra, ...(passed ? { passed } : {}) } : null;
  return { ...context, names, self };
}

/** The context of `fn` of `client.map` and `client.reduce`: the names of the item, and an operand call. */
function fnContext(context: Context, names: Readonly<Record<string, unknown>>): Context {
  return { ...context, names, self: { position: "operand", extra: NO_EXTRA } satisfies CallFrame };
}

function items(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(`items must be an array, got ${value === null ? "null" : typeof value}`);
  return value;
}

/**
 * This function makes the machine of a run of programs: the world of a program, its evaluators
 * and its runners. The kernel capabilities permit each call: the authority is `invokeProcedure()`,
 * through the host of each effect.
 */
export function programMachine(host: ProgramHost): Machine {
  const parallel = host.parallel === true;

  function* call(input: RunInput): Steps {
    const { doc, context, parts } = input;
    const origin = originOf(doc);
    const source = origin?.source ?? { $proc: input.typePath[0] === "procs" ? input.typePath.slice(1) : input.typePath, input: doc.value ?? undefined };
    const ref = origin?.call ?? normalizeRef(source as AnyProcedureRef);
    const frame = origin?.synthesized ? undefined : frameOf(context.self);
    const position: CallPosition = frame?.position ?? "nested";
    const raw = host.rawInput(ref.path);
    let value: unknown;
    if (frame?.passed) {
      // With passThrough, a step without input gets the result of the step before as a literal: it started already
      value = raw ? { [LITERAL_KEY]: frame.passed.value } : frame.passed.value;
    } else if (raw) {
      value = ref.input;
    } else if (ref.input !== undefined) {
      const done = yield* evaluateParts(parts, partContext(context), input.all, parallel);
      if ("failure" in done) return done.failure;
      value = input.fill(done.values);
    }
    const scope = raw && (origin?.scoped ?? true) ? scopeOfNames(context.names) : undefined;
    if (frame?.position === "operand" && Object.keys(frame.extra).length > 0) {
      value = { ...(typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}), ...frame.extra };
    }
    if (raw) value = withScope(value, scope);
    const effect: CallEffect = { position, input: value, source, consumer: origin?.consumer };
    return yield* input.effect(ref.path as readonly Key[], effect);
  }

  function* data(input: RunInput): Steps {
    const done = yield* evaluateParts(input.parts, partContext(input.context), input.all, parallel);
    if ("failure" in done) return done.failure;
    return ok(input.fill(done.values));
  }

  function* deferred(input: RunInput): Steps {
    const origin = originOf(input.doc);
    const source = origin?.source as AnyProcedureRef;
    const done = yield* evaluateParts(input.parts, partContext(input.context), input.all, parallel);
    if ("failure" in done) return done.failure;
    const hydrated = (input.fill(done.values) as { readonly input: unknown }).input;
    return ok(hydrated === (origin?.call ?? normalizeRef(source)).input ? source : { ...source, input: hydrated });
  }

  function* chain(input: RunInput): Steps {
    const source = sourceOf(input);
    const operands = operandsOf(input);
    const steps = operands.list("steps");
    const sourceSteps = Array.isArray(source["steps"]) ? (source["steps"] as unknown[]) : [];
    const extra = parentContext(source);
    const passThrough = Boolean(source["passThrough"]);
    let names: Record<string, unknown> = { ...input.context.names };
    let passed: unknown;
    if (passThrough) {
      const result = yield* operands.run(operands.at("initialInput"), { ...input.context, names, self: null });
      if (!result.ok) return result;
      passed = result.value;
    }
    const results: unknown[] = [];
    for (const [index, step] of steps.entries()) {
      const stepSource = sourceSteps[index];
      const call = isAnyProcedureRef(stepSource) ? normalizeRef(stepSource) : undefined;
      const result = yield* operands.run(step, operandContext(input.context, names, stepSource, extra, passThrough && call?.input === undefined ? { value: passed } : undefined));
      if (!result.ok) return result;
      names = { ...names };
      // A step with a $name gives its result to the later steps. Each step gives it as last.
      const name = headerName(call?.$name);
      if (name !== undefined) setOwn(names, name, result.value);
      setOwn(names, LAST, result.value);
      passed = result.value;
      results.push(result.value);
    }
    return ok({ results, final: results[results.length - 1] });
  }

  function* parallelRunner(input: RunInput): Steps {
    const source = sourceOf(input);
    const operands = operandsOf(input);
    const tasks = operands.list("tasks");
    const sourceTasks = Array.isArray(source["tasks"]) ? (source["tasks"] as unknown[]) : [];
    const extra = parentContext(source);
    const concurrency = source["concurrency"];
    const failFast = Boolean(source["failFast"]);
    const limit = typeof concurrency === "number" && concurrency > 0 ? Math.min(concurrency, tasks.length) : tasks.length;
    let first: Result | undefined;
    const results = yield* input.all(
      tasks.map((task, index) => ({
        key: String(index),
        path: ["tasks", index],
        *evaluate(): Steps {
          const result = yield* operands.run(task, operandContext(input.context, input.context.names, sourceTasks[index], extra));
          if (!result.ok) first ??= result;
          return result;
        },
      })),
      { concurrency: Math.max(1, limit), failFast },
    );
    if (failFast && first) return first;
    const errors = results.flatMap((result, index) => (result.ok ? [] : [{ index, error: messageOf(result.error) }]));
    return ok({ results: results.map((result) => (result.ok ? result.value : undefined)), allSucceeded: errors.length === 0, errors });
  }

  function* conditional(input: RunInput): Steps {
    const source = sourceOf(input);
    const operands = operandsOf(input);
    const extra = parentContext(source);
    const { names } = input.context;
    const condition = yield* operands.run(operands.at("condition"), operandContext(input.context, names, source["condition"], extra));
    if (!condition.ok) return condition;
    const branch = conditionTruth(condition.value) ? "then" : "else";
    // Only the selected branch runs
    if (source[branch] === undefined) return ok(undefined);
    return yield* operands.run(operands.at(branch), operandContext(input.context, names, source[branch], extra));
  }

  function* tryCatch(input: RunInput): Steps {
    const source = sourceOf(input);
    const operands = operandsOf(input);
    const { names } = input.context;
    const tried = yield* operands.run(operands.at("try"), operandContext(input.context, names, source["try"], NO_EXTRA));
    if (tried.ok) return ok({ success: true, value: tried.value });
    const message = messageOf(tried.error);
    const caught = yield* operands.run(operands.at("catch"), operandContext(input.context, { ...names, error: message }, source["catch"], NO_EXTRA));
    if (!caught.ok) return caught;
    return ok({ success: false, value: caught.value, error: message });
  }

  const shortCircuit = (stopOn: (value: unknown) => boolean) =>
    function* (input: RunInput): Steps {
      const source = sourceOf(input);
      const operands = operandsOf(input);
      const sourceValues = Array.isArray(source["values"]) ? (source["values"] as unknown[]) : [];
      const extra = parentContext(source);
      let last: unknown;
      for (const [index, operand] of operands.list("values").entries()) {
        const result = yield* operands.run(operand, operandContext(input.context, input.context.names, sourceValues[index], extra));
        if (!result.ok) return result;
        last = result.value;
        if (stopOn(last)) return ok(last);
      }
      return ok(last);
    };

  /** The items of `client.map` and `client.reduce`: an array gives a new array, as the interpreter did. */
  function* itemsOf(input: RunInput, operands: Operands): Generator<Promise<unknown>, Result<unknown[]>, unknown> {
    const result = yield* operands.run(operands.at("items"), partContext(input.context));
    if (!result.ok) return result as Result<unknown[]>;
    return ok(Array.isArray(sourceOf(input)["items"]) && Array.isArray(result.value) ? [...(result.value as unknown[])] : items(result.value));
  }

  function* map(input: RunInput): Steps {
    const source = sourceOf(input);
    const operands = operandsOf(input);
    const listed = yield* itemsOf(input, operands);
    if (!listed.ok) return listed;
    if (!isAnyProcedureRef(source["fn"])) return ok({ results: listed.value });
    const as = isPlainObject(input.data) && typeof input.data["as"] === "string" ? input.data["as"] : "item";
    const results: unknown[] = [];
    for (const [index, item] of listed.value.entries()) {
      const names = { ...input.context.names };
      setOwn(names, as, item);
      setOwn(names, "index", index);
      const result = yield* operands.run(operands.at("fn"), fnContext(input.context, names));
      if (!result.ok) return result;
      results.push(result.value);
    }
    return ok({ results });
  }

  function* reduce(input: RunInput): Steps {
    const source = sourceOf(input);
    const operands = operandsOf(input);
    if (!isAnyProcedureRef(source["fn"])) {
      // Without fn, the result is the accumulated value, hydrated like any operand
      const key = source["accumulated"] === undefined || source["accumulated"] === null ? "initial" : "accumulated";
      return yield* operands.run(operands.at(key), partContext(input.context));
    }
    const listed = yield* itemsOf(input, operands);
    if (!listed.ok) return listed;
    const initial = yield* operands.run(operands.at("initial"), partContext(input.context));
    if (!initial.ok) return initial;
    let acc = initial.value;
    for (const [index, item] of listed.value.entries()) {
      const result = yield* operands.run(operands.at("fn"), fnContext(input.context, { ...input.context.names, acc, item, index }));
      if (!result.ok) return result;
      acc = result.value;
    }
    return ok(acc);
  }

  return {
    world: PROGRAM_WORLD,
    plain: true,
    roots: ["names"],
    permits: () => true,
    evaluators: {
      "program.lit": ({ doc }) => ok(doc.value),
      "program.fail": ({ doc }) => {
        throw new Error(String(doc.value));
      },
      "program.ref": ({ doc, resolve }) => {
        const found = resolve(doc.value as readonly unknown[], { hops: false });
        if (found.ok) return ok(found.thing);
        // A missing field is undefined (PROGRAM-FORMAT section 4)
        if (found.code === "#N/A") return ok(undefined);
        const origin = originOf(doc);
        // In the input of a deferred call, the runner can bind the name later
        if (origin?.deferred) return ok(origin.source);
        throw unknownName(origin?.source, doc.value as readonly unknown[]);
      },
    },
    runners: {
      "program.call": call,
      "program.data": data,
      "program.deferred": deferred,
      "program.chain": chain,
      "program.parallel": parallelRunner,
      "program.conditional": conditional,
      "program.tryCatch": tryCatch,
      "program.and": shortCircuit((value) => !value),
      "program.or": shortCircuit((value) => Boolean(value)),
      "program.map": map,
      "program.reduce": reduce,
    },
  };
}

/** The error of a `$ref` name that no scope has. */
function unknownName(source: unknown, path: readonly unknown[]): Error {
  const text = isOutputRef(source)
    ? source.$ref
    : path
        .slice(1)
        .map((key, index) => (index === 0 ? (key === LAST ? "$last" : nameOfKey(String(key))) : String(key)))
        .join(".");
  const name = text.split(".")[0];
  return new Error(
    `Unknown $ref name "${name}" in "${text}": no step, item or input has this name here. ` +
      `For a literal $ref object, write { "$literal": { "$ref": ... } }.`,
  );
}

// =============================================================================
// Runs
// =============================================================================

/** The observers of `observeHydration()`: they get the events of every hydration. */
const hydrationObservers = new Set<(event: HydrationEvent) => void>();

/**
 * This function adds an observer of every hydration in this process (or worker), and gives the
 * function that removes it. A host that does not call `hydrateInput` itself (the Composer of
 * the site runs `client.exec()`) uses it for its trace. The observer gets the events of all
 * concurrent hydrations: use it where one program runs at a time. For the events of one program,
 * give `onRef` to that program: `client.exec(ref, input, { onRef })` (docs review DOC-10).
 */
export function observeHydration(observer: (event: HydrationEvent) => void): () => void {
  hydrationObservers.add(observer);
  return () => {
    hydrationObservers.delete(observer);
  };
}

/** This function tells the observers that a call starts now. An observer that throws does not change the run. */
function notify(onRef: ((event: HydrationEvent) => void) | undefined, event: HydrationEvent): void {
  if (!onRef && hydrationObservers.size === 0) return;
  for (const observer of onRef ? [onRef, ...hydrationObservers] : hydrationObservers) {
    try {
      observer(event);
    } catch {
      // A trace must not change the program
    }
  }
}

/** The machines of the runs, one for each raw-input rule and each value of `parallel`. */
const MACHINES = [new WeakMap<object, Machine>(), new WeakMap<object, Machine>()] as const;

function machineFor(rawInput: (path: ProcedurePath) => boolean, parallel: boolean): Machine {
  const cache = MACHINES[parallel ? 1 : 0];
  let machine = cache.get(rawInput);
  if (!machine) {
    machine = programMachine({ rawInput, parallel });
    cache.set(rawInput, machine);
  }
  return machine;
}

/** The options of a run of a document. */
export interface RunDocumentOptions {
  /** The function that does a call. */
  readonly executor: RefExecutor;
  /** The function that does the root call of a program. The default is `executor`. */
  readonly rootExecutor?: ((path: ProcedurePath, input: unknown) => unknown) | undefined;
  /** The raw-input rule (`rawInputRule()`). The default knows the control-flow paths. */
  readonly rawInput?: ((path: ProcedurePath) => boolean) | undefined;
  /** The observer of the calls that start in the run. */
  readonly onRef?: ((event: HydrationEvent) => void) | undefined;
  /** The scope of the run: its names are the names of the root. */
  readonly scope?: RefScope | undefined;
  /** True: the documents of a value start at the same time. */
  readonly parallel?: boolean | undefined;
}

/**
 * This function runs a document on the kernel (`prepare(...).run(...)`). Each call is an effect:
 * the host does it with the executor. A failed run throws the error of the host (the cause of the
 * error value), so a caller gets the same error as from the call itself.
 */
export async function runDocument(doc: ProgramDocument, options: RunDocumentOptions & { readonly self?: unknown }): Promise<unknown> {
  const machine = machineFor(options.rawInput ?? isControlFlowPath, options.parallel === true);
  const perform = (effect: Effect): unknown => {
    const payload = effect.payload as CallEffect;
    const path = effect.path as ProcedurePath;
    if (payload.position === "nested") notify(options.onRef, { path, ref: payload.source as AnyProcedureRef, consumer: payload.consumer });
    const rootExecutor = payload.position === "root" ? options.rootExecutor : undefined;
    return hostCall(() => (rootExecutor ? rootExecutor(path, payload.input) : options.executor(path, payload.input)));
  };
  const ctx = kernelContext({ names: namesOfScope(options.scope), self: options.self ?? null });
  const result = await prepare(machine, doc).run(ctx, { perform });
  if (!result.ok) throw thrownValue(result.error);
  return result.value;
}

/**
 * Hydrate an input tree by executing any nested procedure references.
 *
 * The input becomes a run document (`desugarInput()`), and the kernel runs it. Each call of the
 * input is an effect: the executor does it, and its result takes the place of the call.
 *
 * The rules:
 * - A ref with `$when: "$immediate"` (the default) runs. A ref whose procedure takes its input
 *   raw (see `HydrateOptions.rawInput`) gets its input unchanged, with the scope attached.
 * - A ref with `$when: "$never"` stays as it is, with its whole subtree.
 * - A ref with `$when: "$parent"` or `$when: "<name>"` stays data for its runner. Its procedure
 *   gets that ref later. The immediate refs of its input run now, unless the procedure takes its
 *   input raw. A named ref runs now only when `contextStack` has the name.
 * - A `$ref` object gives a value from the scope. `{ $literal: value }` gives the value unchanged.
 * - An array whose items are all refs that run now, outside the input of a ref, runs as one
 *   `client.chain`. An array with a deferred ref is a list.
 * - Values that are not plain data (`Date`, `Map`, typed arrays, class instances) stay unchanged.
 *   A subtree without refs stays the same object.
 *
 * @param input - The input object potentially containing procedure references
 * @param executor - Function to execute procedure references
 * @param options - Hydration options
 * @returns The hydrated input with executed procedure refs replaced by their results
 */
export async function hydrateInput<T>(input: T, executor: RefExecutor, options: HydrateOptions = {}): Promise<T> {
  const doc = desugarInput(input, {
    rawInput: options.rawInput,
    contextStack: options.contextStack,
    maxDepth: options.maxDepth,
    scoped: options.scope !== undefined,
  });
  if (!doc) return input;
  return (await runDocument(doc, {
    executor,
    rawInput: options.rawInput,
    onRef: options.onRef,
    scope: options.scope,
    parallel: options.parallel,
  })) as T;
}

/**
 * Execute a deferred procedure reference.
 *
 * This is a helper for procedures that receive deferred refs (via $when) and need to execute
 * them with additional context. The fields of `additionalInput` go over the input of the ref. A
 * procedure that takes its input raw gets it with the scope. Another procedure gets it hydrated
 * (`hydrateInput()`), with the options (for example the runner's `contextStack`).
 *
 * @param ref - The procedure reference to execute
 * @param executor - Function to execute the procedure
 * @param additionalInput - Additional input to merge (e.g., cwd for dag.traverse)
 * @param options - Hydration options for the input of the ref
 * @returns The result of executing the procedure
 */
export async function executeRef<TOutput = unknown>(
  ref: AnyProcedureRef,
  executor: RefExecutor,
  additionalInput?: Record<string, unknown>,
  options: HydrateOptions = {},
): Promise<TOutput> {
  const normalized = normalizeRef(ref);
  const baseInput = typeof normalized.input === "object" ? normalized.input : {};
  const mergedInput = { ...(baseInput as Record<string, unknown>), ...additionalInput };
  if ((options.rawInput ?? isControlFlowPath)(normalized.path)) {
    return executor(normalized.path, withScope(mergedInput, options.scope));
  }
  return executor(normalized.path, await hydrateInput(mergedInput, executor, options));
}

/** The options of `runProgram()`. */
export interface RunProgramOptions extends RunDocumentOptions {}

/**
 * This function runs a program: its root call is the root document of one kernel run. A `$when`
 * on the root call does not apply. A procedure that takes its input raw gets its input with the
 * scope. Another procedure gets its input hydrated as a root: a list of calls is an implicit chain.
 * `client.exec()` and the body of a procedure that `procedure.define` made use it (docs review DOC-3).
 */
export function runProgram(program: AnyProcedureRef, options: RunProgramOptions): Promise<unknown> {
  const doc = desugarProgram(program, { rawInput: options.rawInput, scoped: options.scope !== undefined });
  return runDocument(doc, { ...options, self: ROOT_FRAME });
}

/**
 * The path and the input of the root call of a program: the call that `client.exec()` starts.
 * The kernel runs the program (`runProgram()`) up to its root call, and the function gives the
 * path and the input of that call. The caller then starts the call.
 */
export async function prepareRootCall(
  ref: AnyProcedureRef,
  executor: RefExecutor,
  options: Pick<HydrateOptions, "rawInput" | "onRef" | "scope"> = {},
): Promise<{ path: ProcedurePath; input: unknown }> {
  let root: { path: ProcedurePath; input: unknown } | undefined;
  await runProgram(ref, {
    executor,
    rootExecutor: (path, input) => {
      root = { path, input };
      return undefined;
    },
    rawInput: options.rawInput,
    onRef: options.onRef,
    scope: options.scope,
  });
  return root!;
}

/** The options of `runOperand()`. */
export interface RunOperandOptions extends RunDocumentOptions {
  /** The parent context that the operand call gets in its input (`cwd`, `node`). */
  readonly extra?: Record<string, unknown> | undefined;
}

/**
 * This function runs an operand of a control-flow procedure (`callOperand()`, `evaluateOperand()`).
 * A call is an operand call: only `$never` holds it back, its input is a new hydration, and it gets
 * the parent context. Another value is a new hydration.
 */
export async function runOperand(value: unknown, options: RunOperandOptions): Promise<unknown> {
  const out = desugarOperand(value, settingsOf({ rawInput: options.rawInput, scoped: options.scope !== undefined }), "");
  if ("data" in out) return out.data;
  const frame: CallFrame = { position: "operand", extra: options.extra ?? NO_EXTRA };
  const doc = "doc" in out ? out.doc : makeDoc(["program", "data"], out.template);
  return runDocument(doc, { ...options, self: isAnyProcedureRef(value) ? frame : null });
}

/**
 * This function runs a control-flow procedure on the kernel: its input becomes a document of its
 * kind, and the runner of the kind runs the operands. The input is raw: its scope (`scopeOf()`)
 * gives the names of the caller.
 */
export async function runControl(name: string, input: unknown, options: RunDocumentOptions): Promise<unknown> {
  const value = desugarControlValue(name, input, { rawInput: options.rawInput, scoped: options.scope !== undefined });
  if (value === undefined) throw new TypeError(`client.${name}: the input does not have the shape of the procedure`);
  return runDocument(controlDocument(name, value, input, options.scope !== undefined), options);
}

/** The document of the run of a control-flow procedure: its own entry names the runner of the procedure. */
function controlDocument(name: string, value: Record<string, unknown>, source: unknown, scoped: boolean): ProgramDocument {
  const doc: ProgramDocument = { type: ["client", name], value, own: { eval: `program.${name}` } };
  ORIGINS.set(doc, { source, pointer: "", scoped });
  return doc;
}
