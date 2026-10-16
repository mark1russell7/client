/**
 * A text form of the IR, with one node on each line. The golden tests and the persons who read
 * the result of the compiler use it.
 */

import type { Binding, IRNode, ItemsSpec, ProgramIR, ScopeSnapshot } from "./ir.js";

function json(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text.length > 80 ? `${text.slice(0, 77)}...` : text;
  } catch {
    return "<not JSON>";
  }
}

function binding(value: Binding | undefined): string {
  if (!value) return "-";
  return value.name === undefined ? `b${value.id}` : `b${value.id}:${value.name}`;
}

function scope(snapshot: ScopeSnapshot): string {
  if (!snapshot) return "none";
  return snapshot
    .map((frame) => `[${frame.names.map(([name, value]) => `${name}=${binding(value)}`).join(" ")}${frame.last ? ` $last=${binding(frame.last)}` : ""}]`)
    .join(" ");
}

function extra(value: Readonly<Record<string, unknown>>): string {
  return Object.keys(value).length > 0 ? ` extra=${json(value)}` : "";
}

/** This function gives the text of the IR of a program. */
export function printIR(ir: ProgramIR): string {
  const lines: string[] = [`program mode=${ir.mode}${ir.input ? ` input=${binding(ir.input)}` : ""}`];
  const line = (depth: number, text: string): void => {
    lines.push(`${"  ".repeat(depth)}${text}`);
  };
  const items = (spec: ItemsSpec, depth: number): void => {
    if (spec.kind === "list") {
      line(depth, `items list(${spec.items.length})`);
      for (const item of spec.items) visit(item, depth + 1);
    } else {
      line(depth, "items value");
      visit(spec.value, depth + 1);
    }
  };
  const visit = (node: IRNode, depth: number): void => {
    const at = ` @${json(node.pointer)}`;
    switch (node.kind) {
      case "literal":
        line(depth, `literal ${node.origin} ${json(node.value)}${at}`);
        return;
      case "object":
        line(depth, `object${at}`);
        for (const entry of node.entries) {
          line(depth + 1, `key ${json(entry.key)}`);
          visit(entry.value, depth + 2);
        }
        return;
      case "array":
        line(depth, `array(${node.items.length})${at}`);
        for (const item of node.items) visit(item, depth + 1);
        return;
      case "reference":
        line(depth, `ref ${json(node.text)} -> ${node.binding ? binding(node.binding) : node.deferred ? "data (deferred)" : "unknown"}${at}`);
        return;
      case "call":
        line(depth, `call ${node.key} ${node.position}${extra(node.extra)}${at}`);
        visit(node.input, depth + 1);
        return;
      case "deferred":
        line(depth, `deferred ${node.key} when=${json(node.when)}${at}`);
        visit(node.input, depth + 1);
        return;
      case "dynamic":
        line(depth, `dynamic ${node.key} ${node.position} reason=${node.reason}${extra(node.extra)} scope=${scope(node.scope)}${at}`);
        visit(node.input, depth + 1);
        if (node.model) {
          line(depth + 1, "model");
          visit(node.model, depth + 2);
        }
        return;
      case "fail":
        line(depth, `fail ${json(node.message)}${at}`);
        return;
      case "chain":
        line(depth, `chain${node.implicit ? " implicit" : ""} ${node.position}${node.passThrough ? ` passThrough initial=${binding(node.initial)}` : ""}${at}`);
        if (node.initialInput) {
          line(depth + 1, "initialInput");
          visit(node.initialInput, depth + 2);
        }
        for (const step of node.steps) {
          line(depth + 1, `step -> ${binding(step.result)}`);
          visit(step.node, depth + 2);
        }
        return;
      case "parallel":
        line(depth, `parallel ${node.position} concurrency=${node.concurrency ?? "all"} failFast=${node.failFast}${at}`);
        for (const task of node.tasks) visit(task, depth + 1);
        return;
      case "conditional":
        line(depth, `conditional ${node.position}${at}`);
        visit(node.condition, depth + 1);
        line(depth + 1, "then");
        if (node.then) visit(node.then, depth + 2);
        line(depth + 1, "else");
        if (node.else) visit(node.else, depth + 2);
        return;
      case "try":
        line(depth, `try ${node.position} error=${binding(node.error)}${at}`);
        visit(node.try, depth + 1);
        line(depth + 1, "catch");
        visit(node.catch, depth + 2);
        return;
      case "and":
      case "or":
        line(depth, `${node.kind} ${node.position}${at}`);
        for (const value of node.values) visit(value, depth + 1);
        return;
      case "map":
        line(depth, `map ${node.position} item=${binding(node.item)} index=${binding(node.index)}${at}`);
        items(node.items, depth + 1);
        if (node.fn) {
          line(depth + 1, "fn");
          visit(node.fn, depth + 2);
        }
        return;
      case "reduce":
        line(depth, `reduce ${node.position} acc=${binding(node.acc)} item=${binding(node.item)} index=${binding(node.index)}${at}`);
        if (node.items) items(node.items, depth + 1);
        line(depth + 1, "initial");
        visit(node.initial, depth + 2);
        if (node.fn) {
          line(depth + 1, "fn");
          visit(node.fn, depth + 2);
        }
        return;
    }
  };
  visit(ir.root, 1);
  return `${lines.join("\n")}\n`;
}
