/**
 * The normalize pass: the JSON of a program to the IR.
 *
 * The pass follows the interpreter of `@procedures/client` step by step:
 *
 * - `hydrateValue()` and `hydrateRef()` of `ref.ts` for a value and a call in an input.
 * - `prepareRootCall()` for the root call (`client.exec()` and the body of a defined procedure).
 * - `evaluateOperand()` and `callOperand()` of `core/operands.ts` for an operand of control flow.
 * - The handlers of `core/index.ts` for each control-flow procedure.
 *
 * Each rule of the interpreter has its place here. The rules are the order of the keys, an
 * implicit chain, the raw-input rule, `$when` and `$literal`. They also include a `$ref` with
 * and without a scope, the hydration limits and the parent context (`cwd`, `node`) of an operand.
 */

import {
  getRefWhen,
  isAnyProcedureRef,
  isControlFlowPath,
  isLiteral,
  isPlainObject,
  normalizeRef,
  pathToKey,
  shouldExecuteRef,
  MAX_DATA_DEPTH,
  PURE_EFFECTS,
  WHEN_NEVER,
  type AnyProcedureRef,
  type ProcedureEntry,
  type ProcedurePath,
} from "@procedures/client/browser";
import { childPointer, type Binding, type BindingKind, type CallPosition, type ChainStep, type DynamicReason, type IRNode, type ItemsSpec, type LiteralNode, type Pointer, type ProgramIR, type ReferenceNode } from "./ir.js";
import { isStringPath, type Definition, type ProcedureFacts } from "./facts.js";
import { isOutputRef } from "./refs.js";
import type { Diagnostic, DiagnosticCode, Severity } from "./diagnostics.js";

/** The default limit of nested calls in one hydration (`HydrateOptions.maxDepth` of the client). */
export const MAX_REF_DEPTH = 10;

/** The message of `client.exec()` for a program that is not a call. */
export const ROOT_NOT_CALL_MESSAGE = "exec() requires a ProcedureRef, $proc JSON, or procedure path array";

/** The objects on the path from the root of one hydration to a value (to find a cycle). */
interface Ancestors {
  readonly value: object;
  readonly up: Ancestors | undefined;
}

/** The state of one hydration, as `HydrateContext` of the client has it. */
interface Hydration {
  /** True when the hydration has a scope: then a `$ref` reads it. */
  readonly scoped: boolean;
  readonly refDepth: number;
  readonly skipImplicitChain: boolean;
  readonly deferred: boolean;
  readonly dataDepth: number;
  readonly ancestors: Ancestors | undefined;
}

const NO_EXTRA: Readonly<Record<string, unknown>> = Object.freeze({});

/** The options of the pass. */
export interface NormalizeOptions {
  readonly mode: "exec" | "body";
  /** The pointer of the program in a bigger document (the body of a definition). */
  readonly base?: Pointer | undefined;
}

/** The result of the pass. */
export interface NormalizeResult {
  readonly ir: ProgramIR;
  readonly diagnostics: Diagnostic[];
}

/** This function makes the IR of a program. */
export function normalize(program: unknown, facts: ProcedureFacts, options: NormalizeOptions): NormalizeResult {
  const normalizer = new Normalizer(facts);
  const ir = normalizer.program(program, options.mode, options.base ?? "");
  return { ir, diagnostics: normalizer.diagnostics };
}

function hasKeys(value: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(value).length > 0;
}

/** The input of an operand call with the parent context: `callOperand()` of the client. */
export function mergeExtra(input: unknown, extra: Readonly<Record<string, unknown>>): unknown {
  if (!hasKeys(extra)) return input;
  return { ...(typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}), ...extra };
}

/** The parent context that a control-flow procedure gives to its operands: `parentContext()` of the client. */
function parentContext(input: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const cwd = input["cwd"];
  const node = input["node"];
  if (!cwd && !node) return NO_EXTRA;
  return { ...(cwd ? { cwd } : {}), ...(node ? { node } : {}) };
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** The text of a path for a message. */
function keyText(path: readonly unknown[]): string {
  return path.map((segment) => String(segment)).join(".");
}

/** The options of an operand call. */
interface OperandOptions {
  /** The value that `passThrough` gives: it replaces the input. */
  readonly passed?: ReferenceNode | undefined;
  /** True for a chain step: the chain binds its `$name`. */
  readonly bindsName?: boolean | undefined;
  /** The text of a `$never` trap: the meaning of a `$never` call at this place. */
  readonly trap?: string | undefined;
}

class Normalizer {
  readonly diagnostics: Diagnostic[] = [];
  private bindingCount = 0;
  /** The control-flow calls on the path (a call object that contains itself through its operands). */
  private readonly flowStack = new Set<object>();

  constructor(private readonly facts: ProcedureFacts) {}

  program(program: unknown, mode: "exec" | "body", base: Pointer): ProgramIR {
    if (mode === "body") {
      const input = this.binding("input", "input", base);
      const root = isAnyProcedureRef(program) ? this.rootCall(program, true, base) : this.hydrateRoot(program, true, base);
      return { mode, root, input, bindingCount: this.bindingCount, program };
    }
    let root: IRNode;
    if (isAnyProcedureRef(program)) {
      root = this.rootCall(program, false, base);
    } else if (Array.isArray(program) && program.every((segment) => typeof segment === "string")) {
      // client.exec(path) starts the procedure with the input {}
      root = this.rootCall({ $proc: program, input: {} }, false, base);
    } else {
      this.report("error", "root-not-call", "The program must be a call ({ $proc, input }): client.exec() starts only a call.", base);
      root = { kind: "fail", pointer: base, message: ROOT_NOT_CALL_MESSAGE };
    }
    return { mode, root, input: undefined, bindingCount: this.bindingCount, program };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private binding(kind: BindingKind, name: string | undefined, pointer: Pointer): Binding {
    return { id: this.bindingCount++, kind, name, pointer };
  }

  private report(severity: Severity, code: DiagnosticCode, message: string, pointer: Pointer): void {
    this.diagnostics.push({ severity, code, message, pointer });
  }

  private literal(value: unknown, origin: LiteralNode["origin"], pointer: Pointer): LiteralNode {
    return { kind: "literal", value, origin, pointer };
  }

  private fail(code: DiagnosticCode, message: string, pointer: Pointer, explanation: string): IRNode {
    this.report("error", code, explanation, pointer);
    return { kind: "fail", message, pointer };
  }

  /** This function reports a path that cannot name a procedure. */
  private checkPath(path: readonly unknown[], pointer: Pointer): void {
    if (path.length === 0) {
      this.report("error", "invalid-path", "The $proc path is empty.", pointer);
    } else if (!isStringPath(path) || path.some((segment) => segment.length === 0)) {
      this.report("error", "invalid-path", `The $proc path ${JSON.stringify(path)} must have strings that are not empty.`, pointer);
    }
  }

  private warnName(ref: AnyProcedureRef, pointer: Pointer, where: string): void {
    const name = normalizeRef(ref).$name;
    if (name !== undefined && name !== "") {
      this.report(
        "warning",
        "name-not-bound",
        `The $name "${String(name)}" names ${where}. Only a step of client.chain puts its $name in the scope, so no $ref can read this name.`,
        pointer,
      );
    }
  }

  private synthetic(binding: Binding, pointer: Pointer): ReferenceNode {
    return { kind: "reference", text: "$passed", name: "$passed", fields: [], deferred: false, source: undefined, synthetic: true, binding, pointer };
  }

  // ===========================================================================
  // The root call and the hydration (ref.ts)
  // ===========================================================================

  /** `prepareRootCall()`: the root call starts also with `$when`, and its input is a hydration root. */
  private rootCall(ref: AnyProcedureRef, scoped: boolean, pointer: Pointer): IRNode {
    const normalized = normalizeRef(ref);
    const path = normalized.path as readonly unknown[] as ProcedurePath;
    this.checkPath(path, pointer);
    this.warnName(ref, pointer, "the root call");
    if (this.facts.rawInput(path)) {
      return this.rawCall(ref, path, normalized.input, "root", scoped, NO_EXTRA, pointer, false);
    }
    const input = this.hydrateRoot(normalized.input, scoped, childPointer(pointer, "input"));
    return { kind: "call", path, key: keyText(path), position: "root", input, extra: NO_EXTRA, name: undefined, pointer };
  }

  /** `hydrateInput()`: a new hydration, at depth 0, where an array of calls is an implicit chain. */
  private hydrateRoot(value: unknown, scoped: boolean, pointer: Pointer): IRNode {
    return this.value(value, { scoped, refDepth: 0, skipImplicitChain: false, deferred: false, dataDepth: 0, ancestors: undefined }, pointer);
  }

  /** `hydrateValue()`. */
  private value(value: unknown, h: Hydration, pointer: Pointer): IRNode {
    if (value === null || typeof value !== "object") return this.literal(value, "data", pointer);
    if (h.dataDepth > MAX_DATA_DEPTH) {
      return this.fail(
        "data-depth",
        `Hydration failed: the input has more than ${MAX_DATA_DEPTH} levels of nesting`,
        pointer,
        `The data nests deeper than ${MAX_DATA_DEPTH} levels: the hydration stops here with an error.`,
      );
    }
    for (let current = h.ancestors; current; current = current.up) {
      if (current.value === value) {
        return this.fail(
          "cyclic-input",
          "Hydration failed: the input is cyclic (an object contains itself)",
          pointer,
          "The input contains itself: the hydration stops here with an error.",
        );
      }
    }
    if (isLiteral(value)) return this.literal(value.$literal, "literal", pointer);
    if (isOutputRef(value)) {
      if (!h.scoped) {
        this.report(
          "warning",
          "unscoped-ref",
          `The $ref "${value.$ref}" is outside each scope, so it is data (for example a JSON Schema reference). A name can be read only in a chain step, map, reduce, the catch of tryCatch or a defined body. Write { "$literal": ... } for data.`,
          pointer,
        );
        return this.literal(value, "unscoped-ref", pointer);
      }
      const [name = "", ...fields] = value.$ref.split(".");
      return { kind: "reference", text: value.$ref, name, fields, deferred: h.deferred, source: value, synthetic: false, binding: undefined, pointer };
    }
    if (isAnyProcedureRef(value)) return this.ref(value, h, pointer);

    const inner: Ancestors = { value, up: h.ancestors };
    const child: Hydration = { ...h, ancestors: inner, dataDepth: h.dataDepth + 1 };
    if (Array.isArray(value)) {
      if (!h.skipImplicitChain && value.length > 0 && value.every((item) => isAnyProcedureRef(item))) {
        if (value.every((item) => shouldExecuteRef(item as AnyProcedureRef, [], false))) {
          return this.implicitChain(value, h, pointer);
        }
        const waiting = value.findIndex((item) => !shouldExecuteRef(item as AnyProcedureRef, [], false));
        this.report(
          "warning",
          "never-trap",
          `This array of calls is a list, not a chain: the call at ${childPointer(pointer, waiting)} waits ($when ${JSON.stringify(getRefWhen(value[waiting] as AnyProcedureRef))}). The other calls start as items of the list, without $name and $last.`,
          pointer,
        );
      }
      const items = Array.from(value, (item: unknown, index) => this.value(item, child, childPointer(pointer, index)));
      if (items.every((node, index) => node.kind === "literal" && node.value === value[index])) {
        return this.literal(value, "data", pointer);
      }
      return { kind: "array", items, pointer };
    }
    if (!isPlainObject(value)) return this.literal(value, "data", pointer);
    const entries = Object.entries(value).map(([key, item]) => ({ key, value: this.value(item, child, childPointer(pointer, key)), source: item }));
    if (entries.every((entry) => entry.value.kind === "literal" && entry.value.value === entry.source)) {
      return this.literal(value, "data", pointer);
    }
    return { kind: "object", entries: entries.map(({ key, value: node }) => ({ key, value: node })), pointer };
  }

  /** `hydrateRef()`: a call in an input. */
  private ref(value: AnyProcedureRef, h: Hydration, pointer: Pointer): IRNode {
    const when = getRefWhen(value);
    if (when === WHEN_NEVER) return this.literal(value, "never", pointer);
    if (h.refDepth >= MAX_REF_DEPTH) {
      return this.fail(
        "depth-limit",
        `Hydration depth exceeded maximum of ${MAX_REF_DEPTH}`,
        pointer,
        `Calls nest more than ${MAX_REF_DEPTH} levels in one input here: the hydration stops with an error. A chain step or another operand starts a new count.`,
      );
    }
    const ref = normalizeRef(value);
    const path = ref.path as readonly unknown[] as ProcedurePath;
    this.checkPath(path, pointer);
    const raw = this.facts.rawInput(path);
    const inner: Ancestors = { value, up: h.ancestors };
    const inputPointer = childPointer(pointer, "input");
    if (!shouldExecuteRef(value, [], false)) {
      this.report(
        "info",
        "deferred-call",
        `This call waits for its runner ($when ${JSON.stringify(when)}): hydration keeps it as data for the procedure that gets it.`,
        pointer,
      );
      if (raw) return this.literal(value, "deferred", pointer);
      const input = this.value(ref.input, { ...h, skipImplicitChain: true, deferred: true, refDepth: h.refDepth + 1, ancestors: inner, dataDepth: h.dataDepth + 1 }, inputPointer);
      if (input.kind === "literal" && input.value === ref.input) return this.literal(value, "deferred", pointer);
      return { kind: "deferred", path, key: keyText(path), when, source: value as unknown as Record<string, unknown>, input, pointer };
    }
    this.warnName(value, pointer, "a call in an input");
    if (raw) return this.rawCall(value, path, ref.input, "nested", h.scoped, NO_EXTRA, pointer, false);
    const input = this.value(ref.input, { ...h, skipImplicitChain: true, deferred: false, refDepth: h.refDepth + 1, ancestors: inner, dataDepth: h.dataDepth + 1 }, inputPointer);
    return { kind: "call", path, key: keyText(path), position: "nested", input, extra: NO_EXTRA, name: undefined, pointer };
  }

  /** An array of calls that start during this hydration: `client.chain` gets it raw as its steps. */
  private implicitChain(steps: unknown[], h: Hydration, pointer: Pointer): IRNode {
    if (h.refDepth >= MAX_REF_DEPTH) {
      return this.fail(
        "depth-limit",
        `Hydration depth exceeded maximum of ${MAX_REF_DEPTH}`,
        pointer,
        `Calls nest more than ${MAX_REF_DEPTH} levels in one input here: the hydration stops with an error.`,
      );
    }
    this.report(
      "info",
      "implicit-chain",
      "This array of calls runs as one client.chain: its value is { results, final }, and the steps can use $name and $last.",
      pointer,
    );
    const ref = { $proc: ["client", "chain"], input: { steps } };
    return this.rawCall(ref, ["client", "chain"], ref.input, "nested", h.scoped, NO_EXTRA, pointer, true);
  }

  // ===========================================================================
  // Operands (core/operands.ts)
  // ===========================================================================

  /** `evaluateOperand()`: a call starts as an operand call, and another value is a new hydration. */
  private operand(value: unknown, scoped: boolean, extra: Readonly<Record<string, unknown>>, pointer: Pointer, trap?: string): IRNode {
    if (isAnyProcedureRef(value)) return this.operandCall(value, scoped, extra, pointer, { trap });
    return this.hydrateRoot(value, scoped, pointer);
  }

  /** `callOperand()`: only `$never` holds the call back, and its input is a new hydration. */
  private operandCall(ref: AnyProcedureRef, scoped: boolean, extra: Readonly<Record<string, unknown>>, pointer: Pointer, options: OperandOptions = {}): IRNode {
    if (getRefWhen(ref) === WHEN_NEVER) {
      if (options.trap) this.report("warning", "never-trap", options.trap, pointer);
      return this.literal(ref, "never", pointer);
    }
    const normalized = normalizeRef(ref);
    const path = normalized.path as readonly unknown[] as ProcedurePath;
    this.checkPath(path, pointer);
    if (!options.bindsName) this.warnName(ref, pointer, "an operand that is not a chain step");
    const inputPointer = childPointer(pointer, "input");
    if (this.facts.rawInput(path)) {
      if (options.passed) {
        // passThrough gives the step the input { $literal: <the value> }, also when the procedure takes it raw
        const input: IRNode = { kind: "object", entries: [{ key: "$literal", value: options.passed }], pointer: inputPointer };
        return this.dynamic(path, "operand", this.rawReason(path), input, extra, undefined, pointer);
      }
      return this.rawCall(ref, path, normalized.input, "operand", scoped, extra, pointer, false);
    }
    const input = options.passed ?? this.hydrateRoot(normalized.input, scoped, inputPointer);
    if (hasKeys(extra) && input.kind === "literal" && (typeof input.value !== "object" || input.value === null || Array.isArray(input.value))) {
      this.report(
        "warning",
        "input-replaced",
        `Control flow adds ${Object.keys(extra).join(" and ")} to the input of this call. The input is ${typeName(input.value)}, not an object, so the call gets only { ${Object.keys(extra).join(", ")} }.`,
        inputPointer,
      );
    }
    const name = typeof normalized.$name === "string" && normalized.$name !== "" ? normalized.$name : undefined;
    return { kind: "call", path, key: keyText(path), position: "operand", input, extra, name, pointer };
  }

  private rawReason(path: ProcedurePath): DynamicReason {
    return (this.facts.entry(path)?.tags ?? []).includes("runs-refs") || isControlFlowPath(path) ? "runs-refs" : "raw-input";
  }

  private dynamic(
    path: ProcedurePath,
    position: CallPosition,
    reason: DynamicReason,
    input: IRNode,
    extra: Readonly<Record<string, unknown>>,
    model: IRNode | undefined,
    pointer: Pointer,
  ): IRNode {
    return { kind: "dynamic", path, key: keyText(path), position, reason, input, extra, model, scope: undefined, pointer };
  }

  /**
   * A call whose procedure takes its input raw. The compiler models the core control-flow
   * procedures. It calls the other procedures with the raw input (a dynamic node).
   */
  private rawCall(
    ref: unknown,
    path: ProcedurePath,
    rawInput: unknown,
    position: CallPosition,
    scoped: boolean,
    extra: Readonly<Record<string, unknown>>,
    pointer: Pointer,
    implicit: boolean,
  ): IRNode {
    const inputPointer = implicit ? pointer : childPointer(pointer, "input");
    let reason: DynamicReason = this.rawReason(path);
    if (isControlFlowPath(path)) {
      if (!this.facts.core(path)) {
        reason = "not-core";
      } else if (typeof ref === "object" && ref !== null && this.flowStack.has(ref)) {
        reason = "cyclic";
      } else {
        const effective = position === "operand" ? mergeExtra(rawInput, extra) : rawInput;
        const at = (key: string): Pointer => (implicit && key === "steps" ? pointer : childPointer(inputPointer, key));
        if (typeof ref === "object" && ref !== null) this.flowStack.add(ref);
        try {
          const node = this.controlFlow(path[1]!, effective, scoped, position, pointer, implicit, at);
          if (node) return node;
        } finally {
          if (typeof ref === "object" && ref !== null) this.flowStack.delete(ref);
        }
        reason = "invalid-control-flow";
      }
    }
    const model = this.modelOf(path, mergeExtra(rawInput, position === "operand" ? extra : NO_EXTRA), scoped, pointer);
    return this.dynamic(path, position, reason, this.literal(rawInput, "data", inputPointer), position === "operand" ? extra : NO_EXTRA, model, pointer);
  }

  /** What `client.eval` runs, when its `procedure` is a literal path or call: one operand call in the scope of the caller. */
  private modelOf(path: ProcedurePath, input: unknown, scoped: boolean, pointer: Pointer): IRNode | undefined {
    if (keyText(path) !== "client.eval" || !this.facts.core(path) || !isPlainObject(input)) return undefined;
    const procedure = input["procedure"];
    const evalInput = input["input"];
    const at = childPointer(pointer, "input");
    if (Array.isArray(procedure) && procedure.every((segment) => typeof segment === "string")) {
      return this.operandCall({ $proc: procedure, input: evalInput }, scoped, NO_EXTRA, at, { bindsName: true });
    }
    if (isAnyProcedureRef(procedure) && !isOutputRef(procedure)) {
      const target = normalizeRef(procedure);
      const refInput = target.input;
      const finalInput =
        evalInput === undefined ? refInput : isPlainObject(refInput) && isPlainObject(evalInput) ? { ...refInput, ...evalInput } : evalInput;
      return this.operandCall({ $proc: target.path, input: finalInput }, scoped, NO_EXTRA, at, { bindsName: true });
    }
    return undefined;
  }

  // ===========================================================================
  // The control-flow procedures (core/index.ts)
  // ===========================================================================

  private invalid(name: string, problem: string, pointer: Pointer): undefined {
    this.report("error", "invalid-control-flow", `The input of client.${name} is not valid: ${problem}. The call fails with a validation error.`, pointer);
    return undefined;
  }

  private controlFlow(
    name: string,
    input: unknown,
    scoped: boolean,
    position: CallPosition,
    pointer: Pointer,
    implicit: boolean,
    at: (key: string) => Pointer,
  ): IRNode | undefined {
    if (!isPlainObject(input)) return this.invalid(name, `the input is ${typeName(input)}, not an object`, pointer);
    const extra = parentContext(input);
    const base = { path: ["client", name], key: `client.${name}`, position, pointer };
    switch (name) {
      case "chain":
        return this.chain(input, extra, base, implicit, at);
      case "parallel": {
        const tasks = input["tasks"];
        if (!Array.isArray(tasks)) return this.invalid(name, "tasks must be an array", pointer);
        const concurrency = input["concurrency"];
        if (concurrency !== undefined && !(typeof concurrency === "number" && Number.isSafeInteger(concurrency) && concurrency >= 1)) {
          return this.invalid(name, "concurrency must be an integer of 1 or more", pointer);
        }
        const failFast = input["failFast"];
        if (failFast !== undefined && typeof failFast !== "boolean") return this.invalid(name, "failFast must be a boolean", pointer);
        const nodes = Array.from(tasks, (task: unknown, index) =>
          this.operand(task, scoped, extra, childPointer(at("tasks"), index), "A $never task gives the call itself as its result: it does not start."),
        );
        return { kind: "parallel", ...base, tasks: nodes, concurrency: concurrency as number | undefined, failFast: failFast === true };
      }
      case "conditional": {
        const condition = this.operand(input["condition"], scoped, extra, at("condition"), "A $never condition is the call object, so the condition is always true.");
        const branch = (key: "then" | "else"): IRNode | undefined =>
          input[key] === undefined ? undefined : this.operand(input[key], scoped, extra, at(key), `A $never ${key} branch gives the call itself: it does not start.`);
        return { kind: "conditional", ...base, condition, then: branch("then"), else: branch("else") };
      }
      case "tryCatch": {
        const tried = this.operand(input["try"], scoped, NO_EXTRA, at("try"), "A $never try operand gives the call itself: it does not start, so it never fails.");
        const error = this.binding("error", "error", at("catch"));
        const caught = this.operand(input["catch"], true, NO_EXTRA, at("catch"), "A $never catch operand gives the call itself: it does not start.");
        return { kind: "try", ...base, try: tried, catch: caught, error };
      }
      case "and":
      case "or": {
        const values = input["values"];
        if (!Array.isArray(values)) return this.invalid(name, "values must be an array", pointer);
        const truth = name === "and" ? "truthy, so client.and goes on" : "truthy, so client.or stops there";
        const nodes = Array.from(values, (value: unknown, index) =>
          this.operand(value, scoped, extra, childPointer(at("values"), index), `A $never operand is the call object: it is ${truth}.`),
        );
        return { kind: name, ...base, values: nodes };
      }
      case "map":
        return this.map(input, scoped, base, at);
      case "reduce":
        return this.reduce(input, scoped, base, at);
      default:
        return undefined;
    }
  }

  private chain(
    input: Record<string, unknown>,
    extra: Readonly<Record<string, unknown>>,
    base: { path: ProcedurePath; key: string; position: CallPosition; pointer: Pointer },
    implicit: boolean,
    at: (key: string) => Pointer,
  ): IRNode | undefined {
    const steps = input["steps"];
    if (!Array.isArray(steps)) return this.invalid("chain", "steps must be an array", base.pointer);
    const passThrough = input["passThrough"];
    if (passThrough !== undefined && typeof passThrough !== "boolean") return this.invalid("chain", "passThrough must be a boolean", base.pointer);
    const initial = passThrough ? this.binding("initial", undefined, at("initialInput")) : undefined;
    const initialInput = passThrough ? this.hydrateRoot(input["initialInput"], true, at("initialInput")) : undefined;
    const result: ChainStep[] = [];
    const names = new Set<string>();
    Array.from(steps).forEach((step: unknown, index) => {
      const stepPointer = childPointer(at("steps"), index);
      let node: IRNode;
      let name: string | undefined;
      if (isAnyProcedureRef(step)) {
        const normalized = normalizeRef(step);
        if (getRefWhen(step) === WHEN_NEVER) {
          this.report("warning", "never-trap", "A $never step gives the call itself as its result: it does not start.", stepPointer);
          node = this.literal(step, "never", stepPointer);
        } else {
          const usesPassed = passThrough === true && normalized.input === undefined;
          const previous = index === 0 ? initial : result[index - 1]?.result;
          const passed = usesPassed && previous ? this.synthetic(previous, childPointer(stepPointer, "input")) : undefined;
          node = this.operandCall(step, true, extra, stepPointer, { passed, bindsName: true });
        }
        const stepName = normalized.$name as unknown;
        if (typeof stepName === "string" && stepName !== "") {
          name = stepName;
        } else if (stepName) {
          this.report("warning", "name-not-bound", `The $name ${JSON.stringify(stepName)} is not a string, so no $ref can read it.`, stepPointer);
        }
      } else {
        node = this.hydrateRoot(step, true, stepPointer);
      }
      if (name !== undefined) {
        if (names.has(name)) {
          this.report("warning", "duplicate-name", `An earlier step has the $name "${name}" too. From this step, $ref "${name}" reads this result.`, stepPointer);
        }
        names.add(name);
      }
      result.push({ pointer: stepPointer, node, result: this.binding("step", name, stepPointer) });
    });
    return { kind: "chain", ...base, implicit, steps: result, passThrough: passThrough === true, initialInput, initial };
  }

  private items(value: unknown, scoped: boolean, pointer: Pointer): ItemsSpec {
    if (Array.isArray(value)) {
      return { kind: "list", items: Array.from(value, (item: unknown, index) => this.hydrateRoot(item, scoped, childPointer(pointer, index))) };
    }
    return { kind: "value", value: this.hydrateRoot(value, scoped, pointer) };
  }

  private map(
    input: Record<string, unknown>,
    scoped: boolean,
    base: { path: ProcedurePath; key: string; position: CallPosition; pointer: Pointer },
    at: (key: string) => Pointer,
  ): IRNode | undefined {
    const as = input["as"];
    if (as !== undefined && typeof as !== "string") return this.invalid("map", "as must be a string", base.pointer);
    const fn = input["fn"];
    if (fn !== undefined && !isAnyProcedureRef(fn)) {
      return this.fail(
        "fn-not-call",
        "client.map: fn must be one call ({ $proc, input }), or absent",
        at("fn"),
        "The fn of client.map must be one call ({ $proc, input }): client.map fails with an error.",
      );
    }
    const items = this.items(input["items"], scoped, at("items"));
    const item = this.binding("item", as ?? "item", at("fn"));
    const index = this.binding("index", "index", at("fn"));
    const fnNode =
      fn === undefined
        ? undefined
        : this.operandCall(fn, true, NO_EXTRA, at("fn"), { trap: "A $never fn gives the call itself for each item: it does not start." });
    return { kind: "map", ...base, items, fn: fnNode, item, index };
  }

  private reduce(
    input: Record<string, unknown>,
    scoped: boolean,
    base: { path: ProcedurePath; key: string; position: CallPosition; pointer: Pointer },
    at: (key: string) => Pointer,
  ): IRNode | undefined {
    const fn = input["fn"];
    if (fn !== undefined && !isAnyProcedureRef(fn)) {
      return this.fail(
        "fn-not-call",
        "client.reduce: fn must be one call ({ $proc, input }), or absent",
        at("fn"),
        "The fn of client.reduce must be one call ({ $proc, input }): client.reduce fails with an error.",
      );
    }
    const acc = this.binding("acc", "acc", at("fn"));
    const item = this.binding("item", "item", at("fn"));
    const index = this.binding("index", "index", at("fn"));
    if (fn === undefined) {
      // Without fn, the result is the hydrated accumulated value (or initial), and the items do not start
      const accumulated = input["accumulated"];
      const source = accumulated ?? input["initial"];
      const initial = this.hydrateRoot(source, scoped, accumulated !== undefined && accumulated !== null ? at("accumulated") : at("initial"));
      return { kind: "reduce", ...base, items: undefined, initial, fn: undefined, acc, item, index };
    }
    const items = this.items(input["items"], scoped, at("items"));
    const initial = this.hydrateRoot(input["initial"], scoped, at("initial"));
    const fnNode = this.operandCall(fn, true, NO_EXTRA, at("fn"), { trap: "A $never fn gives the call itself as the accumulator: it does not start." });
    return { kind: "reduce", ...base, items, initial, fn: fnNode, acc, item, index };
  }
}

// =============================================================================
// The definitions of a program
// =============================================================================

/**
 * This function finds each `procedure.define` call of a program with a literal path and a body
 * that is a call. A later call of such a path is known to the compiler, and its body gives the
 * effects of the call.
 */
export function findDefinitions(program: unknown): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  const visited = new Set<object>();
  const visit = (value: unknown, pointer: Pointer, depth = 0): void => {
    // A define deeper than 3000 levels never starts: hydration stops at 1000 levels of data in one operand
    if (value === null || typeof value !== "object" || visited.has(value) || depth > 3000) return;
    visited.add(value);
    // A $literal and a $never call are data: a define in them does not start
    if (isLiteral(value)) return;
    if (isAnyProcedureRef(value) && getRefWhen(value) === WHEN_NEVER) return;
    if (isAnyProcedureRef(value)) {
      const ref = normalizeRef(value);
      const input = ref.input;
      if (ref.path.length === 2 && ref.path[0] === "procedure" && ref.path[1] === "define" && isPlainObject(input)) {
        const path = input["path"];
        const aggregation = input["aggregation"];
        if (Array.isArray(path) && path.length > 0 && path.every((segment) => typeof segment === "string" && segment.length > 0) && isAnyProcedureRef(aggregation)) {
          const metadata = isPlainObject(input["metadata"]) ? input["metadata"] : undefined;
          const tags = metadata && Array.isArray(metadata["tags"]) && metadata["tags"].every((tag) => typeof tag === "string") ? (metadata["tags"] as string[]) : undefined;
          const entry: ProcedureEntry = {
            path: path as string[],
            key: pathToKey(path as string[]),
            ...(typeof metadata?.["description"] === "string" ? { description: metadata["description"] } : {}),
            ...(tags ? { tags } : {}),
            effects: PURE_EFFECTS,
            input: {},
            output: {},
            dataDriven: true,
            runtime: true,
            hasHandler: true,
          };
          definitions.set(entry.key, { entry, body: aggregation, pointer: childPointer(childPointer(pointer, "input"), "aggregation") });
        }
      }
      visit(input, childPointer(pointer, "input"), depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, childPointer(pointer, index), depth + 1));
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, item] of Object.entries(value)) visit(item, childPointer(pointer, key), depth + 1);
    }
  };
  visit(program, "");
  return definitions;
}
