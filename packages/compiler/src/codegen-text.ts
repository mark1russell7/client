/**
 * The source text: the IR to the text of an ES module (JavaScript or TypeScript).
 *
 * The text does the same steps as the closure code, with the functions of
 * `@procedures/compiler/runtime`. Each literal goes into the text through `JSON.stringify` or
 * through a number or a keyword, so a value of the program cannot change the code. Each key of
 * an object is a computed key, so `__proto__` stays an own property.
 */

import { isPlainObject, type ProcedurePath } from "@procedures/client/browser";
import type { Binding, IRNode, ItemsSpec, Pointer, ProgramIR, ScopeSnapshot } from "./ir.js";
import { childrenOf, walk } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";

/** The options of the source text. */
export interface TextOptions {
  /** `js` (the default) or `ts`: TypeScript adds the types that a strict configuration needs. */
  readonly language?: "js" | "ts" | undefined;
  /** The import specifier of the runtime. The default is `@procedures/compiler/runtime`. */
  readonly runtime?: string | undefined;
  /** The hash of the manifest that the code was compiled against. */
  readonly registryHash: string;
  /** The keys of the procedures that take raw input, for `client.exec(program, input)`. */
  readonly rawKeys: readonly string[];
}

/** One line of the source map: a line of the module and the pointer of its part of the program. */
export interface SourceMapLine {
  /** The line number in the module, from 1. */
  readonly line: number;
  readonly pointer: Pointer;
}

/** The source text of a program. */
export interface ProgramText {
  /** The ES module: its default export is `async (ctx, input) => output`. */
  readonly module: string;
  /**
   * The body of an async function with the parameters `rt` (the runtime), `ctx` and `input`, in
   * JavaScript. A host that can evaluate code (a test, a playground) uses it.
   */
  readonly body: string;
  /** The lines of the module that start a part of the program. */
  readonly sourceMap: SourceMapLine[];
  /** The literals that have no source text. Then the text is not complete. */
  readonly diagnostics: Diagnostic[];
}

/** The deepest literal that the text writes: a deeper value is not serializable (no stack overflow). */
const MAX_LITERAL_DEPTH = 2000;

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const BACKSLASH = String.fromCharCode(0x5c);

/** A string literal: JSON, and the two line separators that a comment does not permit. */
function str(value: string): string {
  return JSON.stringify(value).split(LINE_SEPARATOR).join(BACKSLASH + "u2028").split(PARAGRAPH_SEPARATOR).join(BACKSLASH + "u2029");
}

/**
 * The key of a property in an object literal: a name, or a computed key. `__proto__` is always a
 * computed key: as a name or a string, it sets the prototype and makes no property.
 */
function propertyKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) && key !== "__proto__" ? key : `[${str(key)}]`;
}

/** The comment that names the pointer of a line, for the source map. */
function pointerComment(pointer: Pointer): string {
  return ` // ${str(pointer)}`;
}

class Emitter {
  readonly diagnostics: Diagnostic[] = [];
  private temps = 0;
  /** The bindings that a reference or a scope reads: only these get a variable. */
  readonly used = new Set<number>();
  usesContext = false;
  usesRuntime = false;

  constructor(private readonly ts: boolean) {}

  temp(): string {
    return `t${this.temps++}`;
  }

  rt(name: string): string {
    this.usesRuntime = true;
    return `rt.${name}`;
  }

  ctx(): string {
    this.usesContext = true;
    return "ctx";
  }

  type(annotation: string): string {
    return this.ts ? `: ${annotation}` : "";
  }

  /** The source of a literal value, or undefined when the value has none. */
  literal(value: unknown, pointer: Pointer, seen: Set<object> = new Set()): string {
    switch (typeof value) {
      case "undefined":
        return "undefined";
      case "boolean":
        return value ? "true" : "false";
      case "number":
        if (Number.isNaN(value)) return "NaN";
        if (value === Infinity) return "Infinity";
        if (value === -Infinity) return "-Infinity";
        if (Object.is(value, -0)) return "-0";
        return String(value);
      case "bigint":
        return `${value}n`;
      case "string":
        return str(value);
      case "object": {
        if (value === null) return "null";
        if (seen.has(value)) return this.unserializable(pointer, "the value contains itself");
        if (seen.size > MAX_LITERAL_DEPTH) return this.unserializable(pointer, `the value nests deeper than ${MAX_LITERAL_DEPTH} levels`);
        seen.add(value);
        try {
          if (Array.isArray(value)) return `[${Array.from(value, (item) => this.literal(item, pointer, seen)).join(", ")}]`;
          if (isPlainObject(value) && Object.getOwnPropertySymbols(value).length === 0) {
            const entries = Object.entries(value);
            if (entries.length === 0) return "{}";
            return `{ ${entries.map(([key, item]) => `${propertyKey(key)}: ${this.literal(item, pointer, seen)}`).join(", ")} }`;
          }
          return this.unserializable(pointer, "the value is not plain data (a class instance or a runtime ref)");
        } finally {
          seen.delete(value);
        }
      }
      default:
        return this.unserializable(pointer, `a ${typeof value} has no source text`);
    }
  }

  private unserializable(pointer: Pointer, why: string): string {
    this.diagnostics.push({
      severity: "warning",
      code: "not-serializable",
      message: `The source text cannot hold this literal: ${why}. The text has undefined in its place. The closure code is complete.`,
      pointer,
    });
    return "undefined";
  }

  path(path: ProcedurePath): string {
    return `[${path.map((segment) => str(segment)).join(", ")}]`;
  }

  frames(snapshot: ScopeSnapshot): string {
    if (!snapshot) return "undefined";
    return `[${snapshot
      .map((frame) => {
        const names = frame.names.map(([name, binding]) => `[${str(name)}, ${this.binding(binding)}]`).join(", ");
        return `{ names: [${names}]${frame.last ? `, last: [${this.binding(frame.last)}]` : ""} }`;
      })
      .join(", ")}]`;
  }

  binding(binding: Binding): string {
    return `b${binding.id}`;
  }

  /** An async block that gives a value: `(await (async () => { ... })())`. */
  block(lines: string[], indent: string, pointer: Pointer, what: string): string {
    const inner = lines.map((line) => `${indent}  ${line}`).join("\n");
    return `(await (async () => {${pointerComment(pointer)} ${what}\n${inner}\n${indent}})())`;
  }

  items(spec: ItemsSpec, indent: string): string {
    if (spec.kind === "list") return `[${spec.items.map((item) => this.expr(item, indent)).join(", ")}]`;
    return `${this.rt("items")}(${this.expr(spec.value, indent)})`;
  }

  /** The expression of a node. `indent` is the indent of the line that holds it. */
  expr(node: IRNode, indent: string): string {
    const deeper = `${indent}  `;
    switch (node.kind) {
      case "literal":
        return this.literal(node.value, node.pointer);
      case "object":
        if (node.entries.length === 0) return "{}";
        return `${this.rt("object")}([${node.entries.map((entry) => `[${str(entry.key)}, ${this.expr(entry.value, indent)}]`).join(", ")}])`;
      case "array":
        return `[${node.items.map((item) => this.expr(item, indent)).join(", ")}]`;
      case "reference": {
        if (node.binding) {
          const variable = this.binding(node.binding);
          return node.fields.length === 0 ? variable : `${this.rt("get")}(${variable}, [${node.fields.map(str).join(", ")}])`;
        }
        if (node.deferred) return this.literal(node.source, node.pointer);
        return `${this.rt("unknownName")}(${str(node.text)})`;
      }
      case "call": {
        const input = this.expr(node.input, indent);
        const merged = Object.keys(node.extra).length > 0 ? `${this.rt("merge")}(${input}, ${this.literal(node.extra, node.pointer)})` : input;
        return `(await ${this.rt("call")}(${this.ctx()}, ${this.path(node.path)}, ${merged}))`;
      }
      case "deferred":
        return `${this.rt("deferred")}(${this.literal(node.source, node.pointer)}, ${this.expr(node.input, indent)})`;
      case "dynamic": {
        const input = this.expr(node.input, indent);
        const merged = Object.keys(node.extra).length > 0 ? `${this.rt("merge")}(${input}, ${this.literal(node.extra, node.pointer)})` : input;
        return `(await ${this.rt("callRaw")}(${this.ctx()}, ${this.path(node.path)}, ${merged}, ${this.frames(node.scope)}))`;
      }
      case "fail":
        return `${this.rt("fail")}(${str(node.message)})`;
      case "chain": {
        const lines: string[] = [];
        if (node.initialInput && node.initial) {
          const initial = this.expr(node.initialInput, deeper);
          lines.push(this.used.has(node.initial.id) ? `const ${this.binding(node.initial)} = ${initial};` : `void ${initial};`);
        }
        for (const step of node.steps) {
          lines.push(`const ${this.binding(step.result)} = ${this.expr(step.node, deeper)};${pointerComment(step.pointer)}`);
        }
        const results = this.temp();
        lines.push(`const ${results}${this.type("unknown[]")} = [${node.steps.map((step) => this.binding(step.result)).join(", ")}];`);
        lines.push(`return { results: ${results}, final: ${results}[${results}.length - 1] };`);
        return this.block(lines, indent, node.pointer, node.implicit ? "implicit chain" : "client.chain");
      }
      case "parallel": {
        const tasks = node.tasks.map((task) => `async () => (${this.expr(task, deeper)})`);
        const concurrency = node.concurrency === undefined ? "undefined" : String(node.concurrency);
        return `(await ${this.rt("parallel")}([${tasks.join(", ")}], ${concurrency}, ${node.failFast ? "true" : "false"}))`;
      }
      case "conditional": {
        const lines = [
          `if (${this.rt("truthy")}(${this.expr(node.condition, deeper)})) return ${node.then ? this.expr(node.then, deeper) : "undefined"};`,
          `return ${node.else ? this.expr(node.else, deeper) : "undefined"};`,
        ];
        return this.block(lines, indent, node.pointer, "client.conditional");
      }
      case "try": {
        const error = this.temp();
        const tried = this.temp();
        const lines = [`try {`, `  const ${tried} = ${this.expr(node.try, `${deeper}  `)};`];
        lines.push(`  return { success: true, value: ${tried} };`);
        lines.push(`} catch (${error}) {`);
        lines.push(`  const ${this.binding(node.error)} = ${this.rt("message")}(${error});`);
        const caught = this.temp();
        lines.push(`  const ${caught} = ${this.expr(node.catch, `${deeper}  `)};`);
        lines.push(`  return { success: false, value: ${caught}, error: ${this.binding(node.error)} };`);
        lines.push(`}`);
        return this.block(lines, indent, node.pointer, "client.tryCatch");
      }
      case "and":
      case "or": {
        const last = this.temp();
        const lines = [`let ${last}${this.type("unknown")};`];
        node.values.forEach((value, index) => {
          lines.push(`${last} = ${this.expr(value, deeper)};${pointerComment(value.pointer)}`);
          if (index < node.values.length - 1) lines.push(`if (${node.kind === "and" ? "!" : ""}${last}) return ${last};`);
        });
        lines.push(`return ${last};`);
        return this.block(lines, indent, node.pointer, `client.${node.kind}`);
      }
      case "map": {
        const values = this.temp();
        const lines = [`const ${values}${this.type("unknown[]")} = ${this.items(node.items, deeper)};`];
        if (!node.fn) {
          lines.push(`return { results: ${values} };`);
        } else {
          const results = this.temp();
          lines.push(`const ${results}${this.type("unknown[]")} = [];`);
          lines.push(`for (const [${this.declare(node.index)}, ${this.declare(node.item)}] of ${values}.entries()) {`);
          lines.push(`  ${results}.push(${this.expr(node.fn, `${deeper}  `)});${pointerComment(node.fn.pointer)}`);
          lines.push(`}`);
          lines.push(`return { results: ${results} };`);
        }
        return this.block(lines, indent, node.pointer, "client.map");
      }
      case "reduce": {
        if (!node.fn || !node.items) return this.expr(node.initial, indent);
        const values = this.temp();
        const acc = this.temp();
        const lines = [
          `const ${values}${this.type("unknown[]")} = ${this.items(node.items, deeper)};`,
          `let ${acc}${this.type("unknown")} = ${this.expr(node.initial, deeper)};`,
          `for (const [${this.declare(node.index)}, ${this.declare(node.item)}] of ${values}.entries()) {`,
        ];
        if (this.used.has(node.acc.id)) lines.push(`  const ${this.binding(node.acc)} = ${acc};`);
        lines.push(`  ${acc} = ${this.expr(node.fn, `${deeper}  `)};${pointerComment(node.fn.pointer)}`);
        lines.push(`}`);
        lines.push(`return ${acc};`);
        return this.block(lines, indent, node.pointer, "client.reduce");
      }
    }
  }

  /** The name of a binding in a declaration, or nothing when no reference reads it. */
  private declare(binding: Binding): string {
    return this.used.has(binding.id) ? this.binding(binding) : "";
  }
}

/** The bindings that the code reads: the resolved references and the scopes of the dynamic nodes. */
function usedBindings(root: IRNode): Set<number> {
  const used = new Set<number>();
  walk(root, (node) => {
    if (node.kind === "reference" && node.binding) used.add(node.binding.id);
    if (node.kind === "dynamic" && node.scope) {
      for (const frame of node.scope) {
        for (const [, binding] of frame.names) used.add(binding.id);
        if (frame.last) used.add(frame.last.id);
      }
    }
  });
  return used;
}

/** The nesting above which the source text gets a warning. V8 refuses a text of approximately 1000 levels. */
const MAX_TEXT_DEPTH = 300;

/** The deepest nesting of the nodes. */
function depthOf(root: IRNode): number {
  let deepest = 0;
  const visit = (node: IRNode, depth: number): void => {
    deepest = Math.max(deepest, depth);
    for (const child of childrenOf(node)) visit(child, depth + 1);
  };
  visit(root, 1);
  return deepest;
}

/** This function writes the source text of a program. */
export function emitText(ir: ProgramIR, options: TextOptions): ProgramText {
  const ts = options.language === "ts";
  const runtime = options.runtime ?? "@procedures/compiler/runtime";
  const emitter = new Emitter(ts);
  for (const id of usedBindings(ir.root)) emitter.used.add(id);
  const depth = depthOf(ir.root);
  if (depth > MAX_TEXT_DEPTH) {
    emitter.diagnostics.push({
      severity: "warning",
      code: "text-depth",
      message: `The program nests ${depth} levels deep: a JavaScript parser can refuse a source text this deep. The closure code has no such limit.`,
      pointer: ir.root.pointer,
    });
  }

  const bodyLines: string[] = [];
  /** The constants of the exec mode: the module has them one time, the function body has them in the body. */
  const constants: string[] = [];
  let inputUsed = false;
  if (ir.mode === "exec") {
    inputUsed = true;
    constants.push(`const PROGRAM${emitter.type("unknown")} = ${emitter.literal(ir.program, "")};`);
    constants.push(`const RAW_KEYS${emitter.type("string[]")} = [${options.rawKeys.map(str).join(", ")}];`);
    bodyLines.push(`if (input !== undefined) return ${emitter.rt("execWithInput")}(${emitter.ctx()}, PROGRAM, input, RAW_KEYS);`);
  } else if (ir.input && emitter.used.has(ir.input.id)) {
    inputUsed = true;
    bodyLines.push(`const ${emitter.binding(ir.input)} = input;`);
  }
  bodyLines.push(`return ${emitter.expr(ir.root, "  ")};${pointerComment(ir.root.pointer)}`);

  const body = bodyLines.map((line) => `  ${line}`).join("\n");
  const ctxName = emitter.usesContext ? "ctx" : "_ctx";
  const inputName = inputUsed ? "input" : "_input";
  const header = [
    "// Generated by @procedures/compiler from a program. Compile the program again after a change.",
    `// The registry hash: ${options.registryHash}`,
    ...(emitter.usesRuntime ? [`import * as rt from ${str(runtime)};`] : []),
    ...(ts ? [`import type { ProgramContext } from ${str(runtime)};`] : []),
    "",
    `export const registryHash${ts ? ": string" : ""} = ${str(options.registryHash)};`,
    ...(constants.length > 0 ? ["", "// The program, for client.exec(program, input): the input changes the program, so the interpreter runs it", ...constants] : []),
    "",
    ts
      ? `export default async function program(${ctxName}: ProgramContext, ${inputName}?: unknown): Promise<unknown> {`
      : `export default async function program(${ctxName}, ${inputName}) {`,
  ];
  const moduleText = `${[...header, body, "}"].join("\n")}\n`;

  // The function body for `new AsyncFunction("rt", "ctx", "input", body)`: always JavaScript
  const jsEmitter = ts ? emitText(ir, { ...options, language: "js" }) : undefined;
  const functionBody = jsEmitter ? jsEmitter.body : [...constants, ...bodyLines].join("\n");

  const sourceMap: SourceMapLine[] = [];
  moduleText.split("\n").forEach((line, index) => {
    const match = /\/\/ ("(?:[^"\\]|\\.)*")(?: [a-zA-Z. ]*)?$/.exec(line);
    if (match?.[1]) {
      try {
        sourceMap.push({ line: index + 1, pointer: JSON.parse(match[1]) as string });
      } catch {
        // Not a pointer comment
      }
    }
  });
  return { module: moduleText, body: functionBody, sourceMap, diagnostics: emitter.diagnostics };
}
