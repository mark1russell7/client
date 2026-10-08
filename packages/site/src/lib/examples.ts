/**
 * The example programs of the Composer. `examples.test.ts` runs each one and checks its result.
 */

import type { Json } from "./program";

export interface Example {
  id: string;
  title: string;
  /** One sentence: what the example shows. */
  summary: string;
  program: Json;
}

const call = (name: string, input: Json, extra: { $name?: string } = {}): Json => ({
  $proc: ["client", name],
  input,
  ...extra,
});
const ref = (name: string): Json => ({ $ref: name });

const users: Json = [
  { name: "Ada", age: 36, active: true },
  { name: "Linus", age: 54, active: false },
  { name: "Grace", age: 45, active: true },
  { name: "Alan", age: 41, active: true },
];

export const examples: Example[] = [
  {
    id: "nested",
    title: "Nested calls",
    summary: "A call can be the value of an input. The inner call runs first.",
    program: call("add", { a: call("multiply", { a: 3, b: 4 }), b: 5 }),
  },
  {
    id: "chain",
    title: "Named steps",
    summary: "A chain runs its steps in sequence. A step reads an earlier result with $ref.",
    program: call("chain", {
      steps: [
        call("add", { a: 20, b: 5 }, { $name: "subtotal" }),
        call("multiply", { a: ref("subtotal"), b: 1.2 }, { $name: "total" }),
        call("template", { template: "Total: {{total}}", values: { total: ref("total") } }),
      ],
    }),
  },
  {
    id: "pipeline",
    title: "Data pipeline",
    summary: "Filter, sort and format a list of records, step by step.",
    program: call("chain", {
      steps: [
        call("constant", { value: users }, { $name: "users" }),
        call("where", { items: ref("users"), where: { active: true } }, { $name: "active" }),
        call("sort", { items: ref("active"), key: "age" }, { $name: "sorted" }),
        call("pluck", { items: ref("sorted"), key: "name" }, { $name: "names" }),
        call("join", { values: ref("names"), separator: ", " }),
      ],
    }),
  },
  {
    id: "reduce",
    title: "Map and reduce",
    summary: "The sum of the squares of 1 to 5. fn reads the accumulator and the item with $ref.",
    program: call("reduce", {
      items: call("range", { start: 1, end: 6 }),
      initial: 0,
      fn: call("add", { a: ref("acc"), b: call("multiply", { a: ref("item"), b: ref("item") }) }),
    }),
  },
  {
    id: "map",
    title: "Map with a template",
    summary: "map runs fn once for each item. The item and its index are $refs.",
    program: call("map", {
      items: ["ada", "grace", "alan"],
      as: "name",
      fn: call("template", {
        template: "{{index}}: {{name}}",
        values: { index: ref("index"), name: call("toUpper", { value: ref("name") }) },
      }),
    }),
  },
  {
    id: "conditional",
    title: "Conditional",
    summary: "Only the selected branch runs. The trace shows that the other branch did not run.",
    program: call("conditional", {
      condition: call("gt", { a: call("strLength", { value: "procedures" }), b: 5 }),
      then: call("constant", { value: "a long word" }),
      else: call("constant", { value: "a short word" }),
    }),
  },
  {
    id: "trycatch",
    title: "Try and catch",
    summary: "The division by zero throws. The catch branch gives the fallback value.",
    program: call("tryCatch", {
      try: call("divide", { a: 1, b: 0 }),
      catch: call("constant", { value: "fallback" }),
    }),
  },
  {
    id: "parallel",
    title: "Parallel",
    summary: "The tasks run at the same time. The trace shows that they overlap.",
    program: call("parallel", {
      tasks: [
        call("add", { a: 1, b: 2 }),
        call("toUpper", { value: "procedures as data" }),
        call("range", { start: 0, end: 5 }),
      ],
    }),
  },
];

export const firstExample: Example = examples[0]!;
