/**
 * A Mermaid flowchart of a program (roadmap R23).
 *
 * The diagram comes from the IR, so it shows what the interpreter does:
 *
 * - A solid arrow is the order of the interpreter. A call in an input starts before its call.
 * - A chain is a subgraph with its steps in order. A parallel call has a fork and a join.
 * - A conditional call is a decision with a `then` arrow and an `else` arrow.
 * - A `client.tryCatch` call has a `try` subgraph and an `error` arrow to its catch part.
 * - A map or a reduce has a loop node: an arrow to `fn` for each item, and an arrow back.
 * - The operands of `client.and` and `client.or` are in order, with a stop arrow from each operand.
 * - A dotted arrow goes from the part that binds a name to each `$ref` that reads the name.
 * - A dynamic call and a deferred call have their own class and a second line of text.
 *
 * Each label goes through `mermaidText()`, so no text of a program can break the syntax.
 */

import { isAnyProcedureRef, normalizeRef } from "@procedures/client/browser";
import type { ChainNode, ConditionalNode, DynamicReason, IRNode, ItemsSpec, LogicNode, MapNode, ParallelNode, ProgramIR, ReduceNode, ReferenceNode, TryNode } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import { checkProgram, type CheckOptions } from "./program.js";

/** The options of `toMermaid()`. */
export interface MermaidOptions {
  /** The direction of the flowchart: `TD` (from the top down, the default) or `LR` (from left to right). */
  readonly direction?: "TD" | "LR" | undefined;
  /** The diagnostics of the check. A node with an error at its pointer gets the class `error`. */
  readonly diagnostics?: readonly Diagnostic[] | undefined;
}

/** The characters that a label keeps as they are. Each other character becomes a Mermaid entity code. */
const SAFE_CHARACTER = /^[A-Za-z0-9 .,_\-/+=?!'()]$/;

/** The default limit of the characters of one line of a label. */
const LINE_LIMIT = 60;

/**
 * This function makes a text safe for a quoted Mermaid label. It keeps letters, digits, spaces
 * and some punctuation. It writes each other character as an entity code (`#34;` for a quote).
 * Thus quotes, brackets, `<`, `#`, line breaks and the Unicode line separators cannot break the
 * syntax. A text longer than `limit` characters ends with three dots.
 */
export function mermaidText(text: string, limit: number = LINE_LIMIT): string {
  const characters = Array.from(text);
  const kept = characters.length > limit ? [...characters.slice(0, Math.max(0, limit - 3)), ".", ".", "."] : characters;
  return kept.map((character) => (SAFE_CHARACTER.test(character) ? character : `#${character.codePointAt(0)};`)).join("");
}

/** A part of the diagram: the node where the part starts and the node that gives its value. */
interface Fragment {
  readonly first: string;
  readonly last: string;
}

type Shape = "box" | "subroutine" | "round" | "stadium" | "decision" | "hexagon" | "circle";

const SHAPES: Record<Shape, readonly [string, string]> = {
  box: ["[", "]"],
  subroutine: ["[[", "]]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  decision: ["{", "}"],
  hexagon: ["{{", "}}"],
  circle: ["((", "))"],
};

type NodeClass = "call" | "control" | "dynamic" | "deferred" | "value" | "boundary" | "fail" | "error";

/** The styles of the classes, in the order of the `classDef` lines. */
const CLASS_STYLES: ReadonlyArray<readonly [NodeClass, string]> = [
  ["call", "fill:#e7f0ff,stroke:#2f5fb3,color:#10213f"],
  ["control", "fill:#f1ebff,stroke:#6741d9,color:#1f1147"],
  ["dynamic", "fill:#fff1e0,stroke:#d9480f,stroke-width:2px,color:#3d1a00"],
  ["deferred", "fill:#f4f4f5,stroke:#71717a,stroke-dasharray:5 4,color:#27272a"],
  ["value", "fill:#f8fafc,stroke:#94a3b8,color:#1e293b"],
  ["boundary", "fill:#ecfdf3,stroke:#2f9e44,color:#0b3d1c"],
  ["fail", "fill:#fff5f5,stroke:#e03131,color:#5c0a0a"],
  ["error", "stroke:#e03131,stroke-width:3px"],
];

const REASONS: Record<DynamicReason, string> = {
  "runs-refs": "it runs the refs of its input",
  "raw-input": "it takes its input as data",
  "invalid-control-flow": "the input is not valid",
  "not-core": "not the core procedure",
  cyclic: "the call contains itself",
};

/** The text of a JSON value for a label. */
function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "a value that is not JSON";
  }
}

/** The key of a call object that the IR keeps as data (a `$never` call, a deferred call). */
function callKey(value: unknown): string {
  if (!isAnyProcedureRef(value)) return "a call";
  const path = normalizeRef(value).path as readonly unknown[];
  return path.map((segment) => String(segment)).join(".");
}

/** The text of a data node in a label. */
function valueText(node: IRNode): string {
  switch (node.kind) {
    case "literal":
      return node.origin === "literal" ? `literal ${jsonText(node.value)}` : jsonText(node.value);
    case "object":
      return `object (${node.entries.map((entry) => entry.key).join(", ")})`;
    case "array":
      return `array (${node.items.length})`;
    case "reference":
      return `$ref ${node.text}`;
    default:
      return node.kind;
  }
}

/** The diagram while the drawer makes it. */
class Drawer {
  private readonly body: string[] = [];
  private readonly edges: string[] = [];
  private readonly classes = new Map<NodeClass, string[]>();
  /** The node that gives the value of each binding, by the id of the binding. */
  private readonly sources = new Map<number, string>();
  /** Each `$ref` and the node that reads it. */
  private readonly uses: Array<{ readonly ref: ReferenceNode; readonly target: string }> = [];
  private readonly errors: ReadonlySet<string>;
  private nodeCount = 0;
  private groupCount = 0;
  private depth = 1;

  constructor(diagnostics: readonly Diagnostic[]) {
    this.errors = new Set(diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.pointer));
  }

  private indent(): string {
    return "  ".repeat(this.depth);
  }

  private addClass(name: NodeClass, id: string): void {
    const ids = this.classes.get(name);
    if (ids) ids.push(id);
    else this.classes.set(name, [id]);
  }

  /** This function adds a node with the lines of its label, and gives its id. */
  private node(shape: Shape, lines: readonly string[], name: NodeClass, pointer?: string): string {
    const id = `n${this.nodeCount++}`;
    const [open, close] = SHAPES[shape];
    this.body.push(`${this.indent()}${id}${open}"${lines.map((line) => mermaidText(line)).join("<br/>")}"${close}`);
    this.addClass(name, id);
    if (pointer !== undefined && this.errors.has(pointer)) this.addClass("error", id);
    return id;
  }

  /** This function draws a part in a subgraph, and gives the part and the id of the subgraph. */
  private group(title: string, draw: () => Fragment): { readonly fragment: Fragment; readonly id: string } {
    const id = `s${this.groupCount++}`;
    this.body.push(`${this.indent()}subgraph ${id}["${mermaidText(title)}"]`);
    this.depth++;
    const fragment = draw();
    this.depth--;
    this.body.push(`${this.indent()}end`);
    return { fragment, id };
  }

  /** A solid arrow is the order of the interpreter. A dotted arrow carries data. */
  private edge(from: string, to: string, label?: string, kind: "flow" | "data" = "flow"): void {
    const arrow = kind === "flow" ? "-->" : "-.->";
    this.edges.push(label === undefined ? `  ${from} ${arrow} ${to}` : `  ${from} ${arrow}|"${mermaidText(label)}"| ${to}`);
  }

  private sequence(parts: readonly Fragment[]): Fragment {
    for (let index = 1; index < parts.length; index++) this.edge(parts[index - 1]!.last, parts[index]!.first);
    return { first: parts[0]!.first, last: parts[parts.length - 1]!.last };
  }

  private single(id: string): Fragment {
    return { first: id, last: id };
  }

  /**
   * This function finds the parts of an input. Each call is a part, in the order of the
   * interpreter. Each `$ref` goes to the node that reads the input.
   */
  private collect(node: IRNode, parts: Fragment[], refs: ReferenceNode[]): void {
    switch (node.kind) {
      case "literal":
        if (node.origin === "never" || node.origin === "deferred") parts.push(this.flow(node));
        return;
      case "object":
        for (const entry of node.entries) this.collect(entry.value, parts, refs);
        return;
      case "array":
        for (const item of node.items) this.collect(item, parts, refs);
        return;
      case "reference":
        refs.push(node);
        return;
      default:
        parts.push(this.flow(node));
    }
  }

  /** This function draws the calls of an input, then the node that reads the input. */
  private consumer(input: IRNode | undefined, make: () => string): Fragment {
    const parts: Fragment[] = [];
    const refs: ReferenceNode[] = [];
    if (input) this.collect(input, parts, refs);
    const id = make();
    for (const ref of refs) this.uses.push({ ref, target: id });
    return this.sequence([...parts, this.single(id)]);
  }

  /** This function draws data in the place of an operand: its calls, then a value node. */
  private value(node: IRNode, label: string = valueText(node)): Fragment {
    return this.consumer(node, () => this.node("round", [label], "value", node.pointer));
  }

  /** This function draws one node of the IR and gives its part of the diagram. */
  flow(node: IRNode): Fragment {
    switch (node.kind) {
      case "call":
        return this.consumer(node.input, () => this.node("box", node.name === undefined ? [node.key] : [node.key, `$name ${node.name}`], "call", node.pointer));
      case "dynamic": {
        const fragment = this.consumer(node.input, () => this.node("subroutine", [node.key, `dynamic (${REASONS[node.reason]})`], "dynamic", node.pointer));
        if (node.model) {
          const model = node.model;
          const runs = this.group("runs", () => this.flow(model));
          this.edge(fragment.last, runs.fragment.first, "runs", "data");
        }
        return fragment;
      }
      case "deferred":
        return this.consumer(node.input, () => this.node("box", [node.key, `deferred (waits for ${node.when})`], "deferred", node.pointer));
      case "fail":
        return this.single(this.node("box", ["fail", node.message], "fail", node.pointer));
      case "literal":
        if (node.origin === "never") return this.single(this.node("box", [callKey(node.value), "data ($when $never)"], "deferred", node.pointer));
        if (node.origin === "deferred") return this.single(this.node("box", [callKey(node.value), "deferred (data for its runner)"], "deferred", node.pointer));
        return this.value(node);
      case "object":
      case "array":
      case "reference":
        return this.value(node);
      case "chain":
        return this.chain(node);
      case "parallel":
        return this.parallel(node);
      case "conditional":
        return this.conditional(node);
      case "try":
        return this.tryCatch(node);
      case "and":
      case "or":
        return this.logic(node);
      case "map":
        return this.map(node);
      case "reduce":
        return this.reduce(node);
    }
  }

  private chain(node: ChainNode): Fragment {
    const title = node.implicit ? "implicit chain" : node.passThrough ? `${node.key} (passThrough)` : node.key;
    return this.group(title, () => {
      const parts: Fragment[] = [];
      if (node.initialInput) {
        const initial = this.flow(node.initialInput);
        if (node.initial) this.sources.set(node.initial.id, initial.last);
        parts.push(initial);
      }
      for (const step of node.steps) {
        const part = this.flow(step.node);
        this.sources.set(step.result.id, part.last);
        parts.push(part);
      }
      if (parts.length === 0) parts.push(this.single(this.node("round", ["no steps"], "value", node.pointer)));
      return this.sequence(parts);
    }).fragment;
  }

  private parallel(node: ParallelNode): Fragment {
    const details = [...(node.concurrency !== undefined ? [`concurrency ${node.concurrency}`] : []), ...(node.failFast ? ["failFast"] : [])];
    const fork = this.node("hexagon", [node.key, ...details], "control", node.pointer);
    const tasks = node.tasks.map((task) => this.flow(task));
    const join = this.node("circle", ["join"], "control");
    for (const task of tasks) {
      this.edge(fork, task.first);
      this.edge(task.last, join);
    }
    if (tasks.length === 0) this.edge(fork, join);
    return { first: fork, last: join };
  }

  private conditional(node: ConditionalNode): Fragment {
    const condition = this.flow(node.condition);
    const decision = this.node("decision", [node.key], "control", node.pointer);
    this.edge(condition.last, decision);
    const branches = (["then", "else"] as const).map((label) => {
      const branch = node[label];
      return { label, part: branch ? this.flow(branch) : undefined };
    });
    const join = this.node("circle", ["join"], "control");
    for (const { label, part } of branches) {
      if (part) {
        this.edge(decision, part.first, label);
        this.edge(part.last, join);
      } else {
        this.edge(decision, join, `${label} (nothing)`);
      }
    }
    return { first: condition.first, last: join };
  }

  private tryCatch(node: TryNode): Fragment {
    const header = this.node("hexagon", [node.key], "control", node.pointer);
    const tried = this.group("try", () => this.flow(node.try));
    this.sources.set(node.error.id, tried.id);
    const caught = this.flow(node.catch);
    const join = this.node("circle", ["join"], "control");
    this.edge(header, tried.fragment.first);
    this.edge(tried.fragment.last, join, "ok");
    this.edge(tried.id, caught.first, "error");
    this.edge(caught.last, join);
    return { first: header, last: join };
  }

  private logic(node: LogicNode): Fragment {
    const header = this.node("hexagon", [node.key], "control", node.pointer);
    const values = node.values.map((value) => this.flow(value));
    const join = this.node("circle", ["join"], "control");
    const next = node.kind === "and" ? "true" : "false";
    const stop = node.kind === "and" ? "false (stop)" : "true (stop)";
    if (values.length === 0) this.edge(header, join);
    else this.edge(header, values[0]!.first);
    values.forEach((value, index) => {
      const following = values[index + 1];
      if (following) {
        this.edge(value.last, following.first, next);
        this.edge(value.last, join, stop);
      } else {
        this.edge(value.last, join);
      }
    });
    return { first: header, last: join };
  }

  /** The items of a map or a reduce: the calls of a list, then one node for the list. */
  private items(spec: ItemsSpec, pointer: string): Fragment {
    if (spec.kind === "value") return this.flow(spec.value);
    const parts: Fragment[] = [];
    const refs: ReferenceNode[] = [];
    for (const item of spec.items) this.collect(item, parts, refs);
    const id = this.node("round", [`items (${spec.items.length})`], "value", `${pointer}/input/items`);
    for (const ref of refs) this.uses.push({ ref, target: id });
    return this.sequence([...parts, this.single(id)]);
  }

  /** The loop of a map or a reduce: an arrow to `fn` for each item, an arrow back, and a join. */
  private loop(loop: string, fn: IRNode | undefined): string {
    if (fn) {
      const part = this.flow(fn);
      this.edge(loop, part.first, "each item");
      this.edge(part.last, loop, "next item");
    }
    const join = this.node("circle", ["join"], "control");
    this.edge(loop, join, "done");
    return join;
  }

  private map(node: MapNode): Fragment {
    const items = this.items(node.items, node.pointer);
    const loop = this.node("hexagon", [node.key, `each item (${node.item.name ?? "item"}, ${node.index.name ?? "index"})`], "control", node.pointer);
    this.sources.set(node.item.id, loop);
    this.sources.set(node.index.id, loop);
    this.edge(items.last, loop);
    return { first: items.first, last: this.loop(loop, node.fn) };
  }

  private reduce(node: ReduceNode): Fragment {
    if (!node.fn || !node.items) {
      // Without fn or items, the result is the initial value, and the items do not start
      const initial = this.flow(node.initial);
      const result = this.node("hexagon", [node.key, "no fn (the initial value)"], "control", node.pointer);
      this.edge(initial.last, result);
      return { first: initial.first, last: result };
    }
    const items = this.items(node.items, node.pointer);
    const initial = this.flow(node.initial);
    this.edge(items.last, initial.first);
    const loop = this.node("hexagon", [node.key, "each item (acc, item, index)"], "control", node.pointer);
    for (const binding of [node.acc, node.item, node.index]) this.sources.set(binding.id, loop);
    this.edge(initial.last, loop);
    return { first: items.first, last: this.loop(loop, node.fn) };
  }

  /** This function draws the program and gives the text of the diagram. */
  draw(ir: ProgramIR, direction: "TD" | "LR"): string {
    const start = this.node("stadium", [ir.mode === "body" ? "input" : "start"], "boundary");
    if (ir.input) this.sources.set(ir.input.id, start);
    const root = this.flow(ir.root);
    const result = this.node("stadium", ["result"], "boundary");
    this.edge(start, root.first);
    this.edge(root.last, result);
    // The dotted arrows of the names: from the part that binds a name to each part that reads it
    for (const { ref, target } of this.uses) {
      if (ref.binding) {
        const source = this.sources.get(ref.binding.id);
        if (source !== undefined) this.edge(source, target, ref.synthetic ? "passThrough" : ref.text, "data");
      } else if (!ref.deferred) {
        const unknown = this.node("round", [`unknown name (${ref.text})`], "fail", ref.pointer);
        this.edge(unknown, target, ref.text, "data");
      }
    }
    const styles = CLASS_STYLES.filter(([name]) => this.classes.has(name));
    return [
      `flowchart ${direction}`,
      ...this.body,
      ...this.edges,
      ...styles.map(([name, style]) => `  classDef ${name} ${style}`),
      ...styles.map(([name]) => `  class ${this.classes.get(name)!.join(",")} ${name}`),
      "",
    ].join("\n");
  }
}

/**
 * This function gives a Mermaid flowchart of the IR of a program. The flowchart shows the order
 * of the calls, the control flow and the names. The text has the same lines for the same IR.
 */
export function toMermaid(ir: ProgramIR, options: MermaidOptions = {}): string {
  return new Drawer(options.diagnostics ?? []).draw(ir, options.direction ?? "TD");
}

/** The result of `diagramProgram()`. */
export interface DiagramResult {
  /** True when no diagnostic is an error. */
  readonly ok: boolean;
  /** The text of the Mermaid flowchart. */
  readonly mermaid: string;
  /** The diagnostics of the check, in the order of the program. */
  readonly diagnostics: Diagnostic[];
}

/**
 * This function checks a program and gives the Mermaid flowchart of its IR. A node with an error
 * gets the class `error`. No call of the program starts.
 */
export function diagramProgram(program: unknown, options: CheckOptions & Pick<MermaidOptions, "direction">): DiagramResult {
  const result = checkProgram(program, options);
  return {
    ok: result.ok,
    mermaid: toMermaid(result.ir, { direction: options.direction, diagnostics: result.diagnostics }),
    diagnostics: result.diagnostics,
  };
}
