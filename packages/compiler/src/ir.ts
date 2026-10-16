/**
 * The intermediate representation (IR) of a program.
 *
 * The normalize pass makes the IR from the JSON of a program. Each node is one step of the
 * interpreter: `hydrateInput()` or a control-flow procedure of `@procedures/client`. The code
 * generation follows the IR in the order of the interpreter. Each node keeps the JSON pointer
 * (RFC 6901) of its source in the program.
 */

import type { ProcedurePath } from "@procedures/client/browser";

/** A JSON pointer (RFC 6901) into the program. The empty string is the root. */
export type Pointer = string;

/** This function gives the pointer of a child: the key is escaped as RFC 6901 tells. */
export function childPointer(pointer: Pointer, key: string | number): Pointer {
  return `${pointer}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

/** The kinds of a binding: the source of a name in a scope. */
export type BindingKind = "step" | "initial" | "item" | "index" | "acc" | "error" | "input";

/**
 * A binding is a value that a scope gives to a name. Examples are the result of a chain step,
 * the item of `client.map` and the error of `client.tryCatch`. Each binding gets one variable.
 */
export interface Binding {
  /** The number of the binding, unique in the program. */
  readonly id: number;
  readonly kind: BindingKind;
  /** The name in the scope. A step without `$name` has no name: only `$last` reads it. */
  readonly name: string | undefined;
  /** The pointer of the source of the binding. */
  readonly pointer: Pointer;
}

/** One frame of a static scope, as the interpreter has it at one point of the program. */
export interface ScopeFrame {
  /** The names of the frame and their bindings, in the order of `Map.set`. */
  readonly names: ReadonlyArray<readonly [string, Binding]>;
  /** The binding that `$last` reads in this frame, or undefined when the frame has none. */
  readonly last: Binding | undefined;
}

/** A static scope: the frames from the outermost to the innermost. Undefined: no scope. */
export type ScopeSnapshot = readonly ScopeFrame[] | undefined;

/** Where a call is: the root call, an operand of control flow, or a call in an input. */
export type CallPosition = "root" | "operand" | "nested";

interface NodeBase {
  readonly pointer: Pointer;
}

/** A value that the program gives as it is. */
export interface LiteralNode extends NodeBase {
  readonly kind: "literal";
  /** The value. The closure code gives this object itself, as the interpreter does. */
  readonly value: unknown;
  /**
   * The source of the value. It is plain data, a `$literal`, a `$never` call or a `$ref` outside
   * each scope. It can also be a deferred call of a procedure that takes raw input, or a folded call.
   */
  readonly origin: "data" | "literal" | "never" | "deferred" | "unscoped-ref" | "fold";
}

/** A plain object with values that the interpreter computes. The entries keep the order of `Object.entries`. */
export interface ObjectNode extends NodeBase {
  readonly kind: "object";
  readonly entries: ReadonlyArray<{ readonly key: string; readonly value: IRNode }>;
}

/** An array with items that the interpreter computes, from the first item to the last item. */
export interface ArrayNode extends NodeBase {
  readonly kind: "array";
  readonly items: readonly IRNode[];
}

/** A `$ref`: it reads a name of the scope and optional fields. */
export interface ReferenceNode extends NodeBase {
  readonly kind: "reference";
  /** The text of the `$ref`: a name and fields, with dots. */
  readonly text: string;
  readonly name: string;
  readonly fields: readonly string[];
  /** True in the input of a deferred call: there, an unknown name stays data for the runner. */
  readonly deferred: boolean;
  /** The `$ref` object of the program. A deferred input gives it for an unknown name. */
  readonly source: unknown;
  /** True for a reference that the compiler made (the value that `passThrough` gives). */
  readonly synthetic: boolean;
  /** The binding of the name. The scopes pass sets it. Undefined: no scope has the name. */
  binding: Binding | undefined;
}

/** A call through the client. Its input is hydrated before the call. */
export interface CallNode extends NodeBase {
  readonly kind: "call";
  readonly path: ProcedurePath;
  readonly key: string;
  readonly position: CallPosition;
  readonly input: IRNode;
  /** The parent context (`cwd`, `node`) that control flow adds to the input of an operand call. */
  readonly extra: Readonly<Record<string, unknown>>;
  /** The `$name` of the call. Only a chain step binds it. */
  readonly name: string | undefined;
}

/** A call that waits for its runner (`$parent` or a context name): it is data, with its input hydrated. */
export interface DeferredNode extends NodeBase {
  readonly kind: "deferred";
  readonly path: ProcedurePath;
  readonly key: string;
  readonly when: string;
  /** The call object of the program. */
  readonly source: Readonly<Record<string, unknown>>;
  readonly input: IRNode;
}

/** The reasons for a dynamic node. */
export type DynamicReason =
  /** The procedure runs the refs of its input (the `runs-refs` tag): `client.eval`, `dag.traverse`, `procedure.define`. */
  | "runs-refs"
  /** The procedure takes its input as data (the `raw-input` tag): `client.export`. */
  | "raw-input"
  /** The input of a control-flow procedure does not agree with its schema: the call gives the validation error. */
  | "invalid-control-flow"
  /** The registry does not have the core control-flow procedure at the path. */
  | "not-core"
  /** A control-flow call contains itself. */
  | "cyclic";

/**
 * A call whose procedure gets its input raw, and whose operands the compiler does not model.
 * The compiled code calls the procedure through the client with the raw input and the scope:
 * the interpreter of the client runs it.
 */
export interface DynamicNode extends NodeBase {
  readonly kind: "dynamic";
  readonly path: ProcedurePath;
  readonly key: string;
  readonly position: CallPosition;
  readonly reason: DynamicReason;
  /** The raw input: a literal, or a value that the compiled code computes (`passThrough`). */
  readonly input: IRNode;
  readonly extra: Readonly<Record<string, unknown>>;
  /** What the procedure runs, when the compiler can see it (`client.eval` of a literal path). Only the checks read it. */
  readonly model: IRNode | undefined;
  /** The scope that the call gets (`withScope`). The scopes pass sets it. */
  scope: ScopeSnapshot;
}

/** A step of the interpreter that throws: a hydration limit, or a `fn` that is not a call. */
export interface FailNode extends NodeBase {
  readonly kind: "fail";
  readonly message: string;
}

interface ControlBase extends NodeBase {
  readonly path: ProcedurePath;
  readonly key: string;
  readonly position: CallPosition;
}

/** One step of a chain. */
export interface ChainStep {
  readonly pointer: Pointer;
  readonly node: IRNode;
  /** The result of the step: `$last` and `passThrough` read it, and `$name` names it. */
  readonly result: Binding;
}

/** `client.chain`, or an array of calls that runs as one chain (an implicit chain). */
export interface ChainNode extends ControlBase {
  readonly kind: "chain";
  readonly implicit: boolean;
  readonly steps: readonly ChainStep[];
  readonly passThrough: boolean;
  /** The hydrated `initialInput` when `passThrough` is true. */
  readonly initialInput: IRNode | undefined;
  readonly initial: Binding | undefined;
}

/** `client.parallel`. */
export interface ParallelNode extends ControlBase {
  readonly kind: "parallel";
  readonly tasks: readonly IRNode[];
  readonly concurrency: number | undefined;
  readonly failFast: boolean;
}

/** `client.conditional`. An absent branch is undefined: the result is undefined, and nothing runs. */
export interface ConditionalNode extends ControlBase {
  readonly kind: "conditional";
  readonly condition: IRNode;
  readonly then: IRNode | undefined;
  readonly else: IRNode | undefined;
}

/** `client.tryCatch`. */
export interface TryNode extends ControlBase {
  readonly kind: "try";
  readonly try: IRNode;
  readonly catch: IRNode;
  readonly error: Binding;
}

/** `client.and` and `client.or`. */
export interface LogicNode extends ControlBase {
  readonly kind: "and" | "or";
  readonly values: readonly IRNode[];
}

/** The `items` of `client.map` and `client.reduce`: an array whose items are hydrated one by one, or one value. */
export type ItemsSpec =
  | { readonly kind: "list"; readonly items: readonly IRNode[] }
  | { readonly kind: "value"; readonly value: IRNode };

/** `client.map`. */
export interface MapNode extends ControlBase {
  readonly kind: "map";
  readonly items: ItemsSpec;
  readonly fn: IRNode | undefined;
  readonly item: Binding;
  readonly index: Binding;
}

/** `client.reduce`. Without `fn`, the result is the hydrated `initial` (or `accumulated`), and the items do not run. */
export interface ReduceNode extends ControlBase {
  readonly kind: "reduce";
  readonly items: ItemsSpec | undefined;
  readonly initial: IRNode;
  readonly fn: IRNode | undefined;
  readonly acc: Binding;
  readonly item: Binding;
  readonly index: Binding;
}

/** The nodes of the control flow. */
export type ControlNode = ChainNode | ParallelNode | ConditionalNode | TryNode | LogicNode | MapNode | ReduceNode;

/** A node of the IR. */
export type IRNode =
  | LiteralNode
  | ObjectNode
  | ArrayNode
  | ReferenceNode
  | CallNode
  | DeferredNode
  | DynamicNode
  | FailNode
  | ControlNode;

/** The IR of a program. */
export interface ProgramIR {
  /** `exec`: the program runs as `client.exec()` runs it. `body`: as the body of a defined procedure. */
  readonly mode: "exec" | "body";
  readonly root: IRNode;
  /** The binding of `input` in the body mode. */
  readonly input: Binding | undefined;
  /** The number of bindings: the ids go from 0 to this number minus one. */
  readonly bindingCount: number;
  /** The program, as the source of the IR. */
  readonly program: unknown;
}

/** True for the nodes that call a procedure (a control-flow node is a call in the interpreter). */
export function isCallLike(node: IRNode): node is CallNode | DynamicNode | ControlNode {
  return node.kind === "call" || node.kind === "dynamic" || isControl(node);
}

/** True for a control-flow node. */
export function isControl(node: IRNode): node is ControlNode {
  switch (node.kind) {
    case "chain":
    case "parallel":
    case "conditional":
    case "try":
    case "and":
    case "or":
    case "map":
    case "reduce":
      return true;
    default:
      return false;
  }
}

/** The child nodes of a node, in the order of the interpreter. A dynamic node gives its input, not its model. */
export function childrenOf(node: IRNode): IRNode[] {
  switch (node.kind) {
    case "literal":
    case "reference":
    case "fail":
      return [];
    case "object":
      return node.entries.map((entry) => entry.value);
    case "array":
      return [...node.items];
    case "call":
    case "deferred":
    case "dynamic":
      return [node.input];
    case "chain":
      return [...(node.initialInput ? [node.initialInput] : []), ...node.steps.map((step) => step.node)];
    case "parallel":
      return [...node.tasks];
    case "conditional":
      return [node.condition, ...(node.then ? [node.then] : []), ...(node.else ? [node.else] : [])];
    case "try":
      return [node.try, node.catch];
    case "and":
    case "or":
      return [...node.values];
    case "map":
      return [...itemsChildren(node.items), ...(node.fn ? [node.fn] : [])];
    case "reduce":
      return [...(node.items ? itemsChildren(node.items) : []), node.initial, ...(node.fn ? [node.fn] : [])];
  }
}

function itemsChildren(items: ItemsSpec): IRNode[] {
  return items.kind === "list" ? [...items.items] : [items.value];
}

/** This function calls `visit` for each node of the tree, parents before children. */
export function walk(node: IRNode, visit: (node: IRNode) => void): void {
  visit(node);
  for (const child of childrenOf(node)) walk(child, visit);
}
