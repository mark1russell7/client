/**
 * The catalog of the core procedures (roadmap R29): one or more examples for each procedure.
 *
 * Each example runs as a host runs a call: `invokePath()` with a registry of the core
 * procedures. The test validates the input and each output with the schemas of the procedure,
 * compares the output with `toEqual`, and examines the declared effects.
 *
 * A new core procedure needs an entry here: the first test fails without one. An entry for a
 * procedure that does not exist also fails.
 *
 * An example with `defect` shows a documented behavior that the procedure does not have. It runs
 * as `it.fails`, and the text tells the defect. After a fix of the defect, remove `defect`.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry } from "../registry.js";
import { invokePath, outputItems } from "../invoke.js";
import { jsonSchemaOf, validateSchema, type ProcedureSchema } from "../schema.js";
import { PROCEDURE_SYMBOL } from "../ref.js";
import { pathToKey, type AnyProcedure } from "../types.js";
import { MAX_RANGE_LENGTH, allCoreProcedures } from "./index.js";

// =============================================================================
// The examples
// =============================================================================

/** An example: an input and its output, or an input and the error that refuses it. */
type Example =
  | {
      /** What the example shows */
      readonly note: string;
      readonly input: unknown;
      /** The output. A stream gives the array of its items. */
      readonly output: unknown;
      /** The documented behavior that the procedure does not have. The example runs as `it.fails`. */
      readonly defect?: string;
    }
  | {
      readonly note: string;
      readonly input: unknown;
      /** The error code (`VALIDATION_ERROR`), or a part of the error message */
      readonly error: string;
    };

/** A call of a core procedure, as a program writes it. */
const call = (name: string, input?: unknown): Record<string, unknown> =>
  input === undefined ? { $proc: ["client", name] } : { $proc: ["client", name], input };

/** The runtime form of a call: `client.import` and `client.parseJson` give it. */
const runtimeRef = (name: string, input: unknown): Record<string | symbol, unknown> => ({
  [PROCEDURE_SYMBOL]: true,
  path: ["client", name],
  input,
});

const ada = { name: "ada", team: "a", age: 36 };
const bob = { name: "bob", team: "b", age: 41 };
const people = [ada, bob];

const CATALOG: Record<string, readonly Example[]> = {
  // ---------------------------------------------------------------------------
  // Control flow
  // ---------------------------------------------------------------------------
  "client.chain": [
    {
      note: "runs the steps in order, and a step reads the result before as $last",
      input: { steps: [call("add", { a: 1, b: 2 }), call("multiply", { a: { $ref: "$last" }, b: 10 })] },
      output: { results: [3, 30], final: 30 },
    },
    {
      note: "a step reads a named step with $ref",
      input: {
        steps: [
          { ...call("add", { a: 2, b: 3 }), $name: "sum" },
          call("toUpper", { value: "x" }),
          call("multiply", { a: { $ref: "sum" }, b: { $ref: "sum" } }),
        ],
      },
      output: { results: [5, "X", 25], final: 25 },
    },
    {
      note: "with passThrough, a step without input gets the result before, and the first step gets initialInput",
      input: {
        passThrough: true,
        initialInput: { a: 2, b: 3 },
        steps: [call("add"), call("multiply", { a: { $ref: "$last" }, b: 2 })],
      },
      output: { results: [5, 10], final: 10 },
    },
    {
      note: "a $ref in an operand of a nested control-flow procedure reads the outer chain",
      input: {
        steps: [
          { ...call("gt", { a: 5, b: 3 }), $name: "big" },
          call("conditional", { condition: { $ref: "big" }, then: "large", else: "small" }),
        ],
      },
      output: { results: [true, "large"], final: "large" },
    },
    {
      note: "a step that is a value gives the value",
      input: { steps: ["a", { $ref: "$last" }] },
      output: { results: ["a", "a"], final: "a" },
    },
    { note: "an empty chain gives no results", input: { steps: [] }, output: { results: [], final: undefined } },
    {
      note: "an unknown $ref name is an error",
      input: { steps: [call("identity", { value: { $ref: "nothing" } })] },
      error: "Unknown $ref name",
    },
    {
      note: "the error of a step stops the chain",
      input: { steps: [call("throw", { message: "step 1 failed" }), call("add", { a: 1, b: 1 })] },
      error: "step 1 failed",
    },
  ],
  "client.parallel": [
    {
      note: "runs each task and gives the results in the order of the tasks",
      input: { tasks: [call("add", { a: 1, b: 2 }), call("toUpper", { value: "x" }), "plain"] },
      output: { results: [3, "X", "plain"], allSucceeded: true, errors: [] },
    },
    {
      note: "a failed task goes into errors, and the other tasks continue",
      input: { tasks: [call("add", { a: 1, b: 1 }), call("throw", { message: "boom" })] },
      output: { results: [2, undefined], allSucceeded: false, errors: [{ index: 1, error: "boom" }] },
    },
    {
      note: "concurrency 1 runs one task at a time, with the same results",
      input: { tasks: [call("add", { a: 1, b: 1 }), call("add", { a: 2, b: 2 })], concurrency: 1 },
      output: { results: [2, 4], allSucceeded: true, errors: [] },
    },
    { note: "no tasks give no results", input: { tasks: [] }, output: { results: [], allSucceeded: true, errors: [] } },
    {
      note: "with failFast, the first error is the error of the call",
      input: { tasks: [call("throw", { message: "boom" }), call("add", { a: 1, b: 1 })], failFast: true },
      error: "boom",
    },
    { note: "concurrency must be 1 or more", input: { tasks: [], concurrency: 0 }, error: "VALIDATION_ERROR" },
  ],
  "client.conditional": [
    {
      note: "a truthy condition runs then, and else does not run",
      input: {
        condition: call("gt", { a: 5, b: 3 }),
        then: call("toUpper", { value: "big" }),
        else: call("throw", { message: "else ran" }),
      },
      output: "BIG",
    },
    { note: "a falsy condition gives else", input: { condition: 0, then: "yes", else: "no" }, output: "no" },
    {
      note: "the value field of an object decides: { value: 0 } is false",
      input: { condition: { value: 0 }, then: "yes", else: "no" },
      output: "no",
    },
    { note: "a falsy condition without else gives undefined", input: { condition: false, then: "yes" }, output: undefined },
    {
      note: "a branch that is not a call is hydrated as a program",
      input: { condition: true, then: { total: call("add", { a: 5, b: 3 }) } },
      output: { total: 8 },
    },
  ],
  "client.and": [
    { note: "gives the first falsy value", input: { values: [1, "x", 0, "late"] }, output: 0 },
    { note: "gives the last value when all values are truthy", input: { values: [1, "x"] }, output: "x" },
    {
      note: "runs the calls in order and stops at the first falsy result",
      input: {
        values: [call("gt", { a: 2, b: 1 }), call("lt", { a: 2, b: 1 }), call("throw", { message: "not reached" })],
      },
      output: false,
    },
    { note: "no values give undefined", input: { values: [] }, output: undefined },
  ],
  "client.or": [
    { note: "gives the first truthy value", input: { values: [0, "", "found", "late"] }, output: "found" },
    { note: "gives the last value when all values are falsy", input: { values: [0, null, false] }, output: false },
    {
      note: "runs the calls in order and stops at the first truthy result",
      input: {
        values: [call("eq", { a: 1, b: 2 }), call("toUpper", { value: "hit" }), call("throw", { message: "not reached" })],
      },
      output: "HIT",
    },
    { note: "no values give undefined", input: { values: [] }, output: undefined },
  ],
  "client.not": [
    { note: "negates true", input: { value: true }, output: false },
    { note: "negates a falsy value", input: { value: 0 }, output: true },
    { note: "a missing value is falsy", input: {}, output: true },
    {
      note: "negates the result of a call",
      input: { value: call("eq", { a: 1, b: 2 }) },
      output: true,
      defect:
        "The schema says 'The value or call to negate', but a host call does not run the call. A call is an object, thus it is truthy.",
    },
  ],
  "client.all": [
    { note: "true when every value is truthy", input: { values: [true, 1, "x"] }, output: true },
    { note: "false when one value is falsy", input: { values: [1, 0] }, output: false },
    { note: "no values give true", input: { values: [] }, output: true },
    {
      note: "evaluates a call",
      input: { values: [call("eq", { a: 1, b: 2 })] },
      output: false,
      defect: "The schema says 'The values or calls to evaluate', but a host call does not run the calls. A call is truthy.",
    },
  ],
  "client.any": [
    { note: "true when one value is truthy", input: { values: [0, "", 1] }, output: true },
    { note: "false when no value is truthy", input: { values: [0, false, null] }, output: false },
    { note: "no values give false", input: { values: [] }, output: false },
    {
      note: "evaluates a call",
      input: { values: [call("eq", { a: 1, b: 2 })] },
      output: false,
      defect: "The schema says 'The values or calls to evaluate', but a host call does not run the calls. A call is truthy.",
    },
  ],
  "client.none": [
    { note: "true when no value is truthy", input: { values: [0, false, ""] }, output: true },
    { note: "false when one value is truthy", input: { values: [0, 1] }, output: false },
    { note: "no values give true", input: { values: [] }, output: true },
    {
      note: "evaluates a call",
      input: { values: [call("eq", { a: 1, b: 2 })] },
      output: true,
      defect: "The schema says 'The values or calls to evaluate', but a host call does not run the calls. A call is truthy.",
    },
  ],
  "client.map": [
    {
      note: "runs fn for each item, and fn reads item and index",
      input: { items: [1, 2, 3], fn: call("multiply", { a: { $ref: "item" }, b: { $ref: "index" } }) },
      output: { results: [0, 2, 6] },
    },
    {
      note: "as gives the item another name",
      input: { items: ["a", "b"], as: "letter", fn: call("toUpper", { value: { $ref: "letter" } }) },
      output: { results: ["A", "B"] },
    },
    {
      note: "without fn, the results are the items with their calls run",
      input: { items: [1, call("add", { a: 1, b: 1 })] },
      output: { results: [1, 2] },
    },
    {
      note: "items can be a call that gives the array",
      input: { items: call("range", { start: 1, end: 4 }), fn: call("multiply", { a: { $ref: "item" }, b: 10 }) },
      output: { results: [10, 20, 30] },
    },
    {
      note: "no items give no results, and fn does not run",
      input: { items: [], fn: call("throw", { message: "not reached" }) },
      output: { results: [] },
    },
    { note: "a fn that is not one call is an error", input: { items: [1], fn: "double" }, error: "fn must be one call" },
    {
      note: "items that are not an array are an error",
      input: { items: "abc", fn: call("toUpper", { value: { $ref: "item" } }) },
      error: "items must be an array",
    },
  ],
  "client.reduce": [
    {
      note: "runs fn for each item, and its result is the next acc",
      input: { items: [1, 2, 3], initial: 0, fn: call("add", { a: { $ref: "acc" }, b: { $ref: "item" } }) },
      output: 6,
    },
    {
      note: "the items go in order",
      input: { items: ["a", "b", "c"], initial: ">", fn: call("concat", { values: [{ $ref: "acc" }, { $ref: "item" }] }) },
      output: ">abc",
    },
    {
      note: "no items give initial",
      input: { items: [], initial: 42, fn: call("add", { a: { $ref: "acc" }, b: { $ref: "item" } }) },
      output: 42,
    },
    {
      note: "without fn, the result is initial with its calls run",
      input: { items: [1], initial: call("add", { a: 1, b: 2 }) },
      output: 3,
    },
    {
      note: "a fn that is not one call is an error",
      input: { items: [1], initial: 0, fn: [call("add", { a: 1, b: 1 })] },
      error: "fn must be one call",
    },
  ],
  "client.identity": [
    { note: "gives the value unchanged", input: { value: { a: [1, 2] } }, output: { a: [1, 2] } },
    { note: "a missing value gives undefined", input: {}, output: undefined },
  ],
  "client.constant": [
    { note: "gives the value", input: { value: 42 }, output: 42 },
    { note: "null is a value", input: { value: null }, output: null },
  ],
  "client.throw": [
    { note: "throws an error with the message", input: { message: "disk full" }, error: "disk full" },
    { note: "the error has the code", input: { message: "disk full", code: "E_DISK" }, error: "E_DISK" },
    { note: "the message is necessary", input: {}, error: "VALIDATION_ERROR" },
  ],
  "client.tryCatch": [
    {
      note: "a try that succeeds gives its value, and catch does not run",
      input: { try: call("add", { a: 1, b: 2 }), catch: call("throw", { message: "not reached" }) },
      output: { success: true, value: 3 },
    },
    {
      note: "after an error, catch reads the message as $ref error",
      input: { try: call("throw", { message: "disk full" }), catch: { $ref: "error" } },
      output: { success: false, value: "disk full", error: "disk full" },
    },
    {
      note: "catch can be a call",
      input: { try: call("throw", { message: "boom" }), catch: call("toUpper", { value: { $ref: "error" } }) },
      output: { success: false, value: "BOOM", error: "boom" },
    },
    {
      note: "catch catches a validation error of the try call too",
      input: { try: call("add", { a: "1", b: 2 }), catch: "bad input" },
      output: { success: false, value: "bad input", error: expect.stringContaining("Input validation failed for client.add") },
    },
  ],

  // ---------------------------------------------------------------------------
  // Math
  // ---------------------------------------------------------------------------
  "client.add": [
    { note: "adds a and b", input: { a: 1, b: 2 }, output: 3 },
    { note: "uses floating-point numbers", input: { a: 0.1, b: 0.2 }, output: 0.30000000000000004 },
    { note: "a string is not a number", input: { a: "1", b: 2 }, error: "VALIDATION_ERROR" },
  ],
  "client.subtract": [{ note: "subtracts b from a", input: { a: 5, b: 8 }, output: -3 }],
  "client.multiply": [{ note: "multiplies a and b", input: { a: 2.5, b: 4 }, output: 10 }],
  "client.divide": [
    { note: "divides a by b", input: { a: 1, b: 4 }, output: 0.25 },
    { note: "refuses a division by zero", input: { a: 1, b: 0 }, error: "Division by zero" },
  ],
  "client.mod": [
    { note: "gives the remainder of a divided by b", input: { a: 7, b: 3 }, output: 1 },
    { note: "the remainder has the sign of a", input: { a: -7, b: 3 }, output: -1 },
    { note: "b = 0 gives NaN", input: { a: 5, b: 0 }, output: NaN },
  ],
  "client.abs": [
    { note: "gives the absolute value", input: { value: -3 }, output: 3 },
    { note: "a positive value stays", input: { value: 2.5 }, output: 2.5 },
  ],
  "client.min": [
    { note: "gives the smallest value", input: { values: [3, 1, 2] }, output: 1 },
    { note: "no values give Infinity", input: { values: [] }, output: Infinity },
  ],
  "client.max": [
    { note: "gives the largest value", input: { values: [3, 1, 2] }, output: 3 },
    { note: "no values give -Infinity", input: { values: [] }, output: -Infinity },
  ],
  "client.sum": [
    { note: "adds the values", input: { values: [1, 2, 3] }, output: 6 },
    { note: "no values give 0", input: { values: [] }, output: 0 },
  ],
  "client.pow": [
    { note: "raises base to exp", input: { base: 2, exp: 10 }, output: 1024 },
    { note: "a negative exponent gives a fraction", input: { base: 2, exp: -1 }, output: 0.5 },
    { note: "a result that is too large is Infinity", input: { base: 10, exp: 400 }, output: Infinity },
  ],
  "client.sqrt": [
    { note: "gives the square root", input: { value: 9 }, output: 3 },
    { note: "a negative value gives NaN", input: { value: -1 }, output: NaN },
  ],
  "client.floor": [
    { note: "rounds down", input: { value: 1.7 }, output: 1 },
    { note: "rounds a negative value down, away from zero", input: { value: -1.2 }, output: -2 },
  ],
  "client.ceil": [
    { note: "rounds up", input: { value: 1.2 }, output: 2 },
    { note: "rounds a negative value up, toward zero", input: { value: -1.7 }, output: -1 },
  ],
  "client.round": [
    { note: "rounds to an integer by default", input: { value: 2.5 }, output: 3 },
    { note: "rounds to the number of decimals", input: { value: 1.256, decimals: 2 }, output: 1.26 },
    { note: "a half rounds up, also for a negative value", input: { value: -2.5 }, output: -2 },
  ],

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------
  "client.eq": [
    { note: "true for equal values", input: { a: 1, b: 1 }, output: true },
    { note: "strict: a number is not its string", input: { a: 1, b: "1" }, output: false },
    { note: "strict: two equal objects are two objects", input: { a: { x: 1 }, b: { x: 1 } }, output: false },
  ],
  "client.neq": [
    { note: "true for different values", input: { a: 1, b: 2 }, output: true },
    { note: "false for equal values", input: { a: "x", b: "x" }, output: false },
  ],
  "client.gt": [
    { note: "true when a is greater", input: { a: 2, b: 1 }, output: true },
    { note: "false for equal values", input: { a: 1, b: 1 }, output: false },
  ],
  "client.gte": [
    { note: "true for equal values", input: { a: 2, b: 2 }, output: true },
    { note: "false when a is less", input: { a: 1, b: 2 }, output: false },
  ],
  "client.lt": [
    { note: "true when a is less", input: { a: 1, b: 2 }, output: true },
    { note: "false for equal values", input: { a: 2, b: 2 }, output: false },
  ],
  "client.lte": [
    { note: "true for equal values", input: { a: 2, b: 2 }, output: true },
    { note: "false when a is greater", input: { a: 3, b: 2 }, output: false },
    { note: "compares only numbers", input: { a: "1", b: 2 }, error: "VALIDATION_ERROR" },
  ],
  "client.between": [
    { note: "true for a value in the range", input: { value: 5, min: 1, max: 10 }, output: true },
    { note: "includes the bounds by default", input: { value: 10, min: 1, max: 10 }, output: true },
    { note: "inclusive false excludes the bounds", input: { value: 10, min: 1, max: 10, inclusive: false }, output: false },
  ],

  // ---------------------------------------------------------------------------
  // String
  // ---------------------------------------------------------------------------
  "client.concat": [
    { note: "joins the strings", input: { values: ["a", "b", "c"] }, output: "abc" },
    { note: "puts the separator between them", input: { values: ["a", "b"], separator: "-" }, output: "a-b" },
    { note: "no values give an empty string", input: { values: [] }, output: "" },
  ],
  "client.split": [
    { note: "splits at each separator", input: { value: "a,b,c", separator: "," }, output: ["a", "b", "c"] },
    { note: "limit gives only the first parts", input: { value: "a,b,c", separator: ",", limit: 2 }, output: ["a", "b"] },
    { note: "an empty separator gives each character", input: { value: "abc", separator: "" }, output: ["a", "b", "c"] },
  ],
  "client.join": [
    { note: "joins the strings with the separator", input: { values: ["a", "b"], separator: "+" }, output: "a+b" },
    { note: "one value has no separator", input: { values: ["x"], separator: "+" }, output: "x" },
  ],
  "client.replace": [
    { note: "replaces the first match", input: { value: "a-b-c", search: "-", replace: "+" }, output: "a+b-c" },
    { note: "all replaces each match", input: { value: "a-b-c", search: "-", replace: "+", all: true }, output: "a+b+c" },
    {
      note: "the replacement is text: $$ stays $$",
      input: { value: "cost: X", search: "X", replace: "$$5" },
      output: "cost: $$5",
    },
    {
      note: "the replacement is text also with all",
      input: { value: "X and X", search: "X", replace: "$&!", all: true },
      output: "$&! and $&!",
    },
  ],
  "client.substring": [
    { note: "gives the part from start to end (exclusive)", input: { value: "hello", start: 1, end: 3 }, output: "el" },
    { note: "without end, the part goes to the end", input: { value: "hello", start: 1 }, output: "ello" },
    { note: "a negative start counts as 0, unlike client.slice", input: { value: "hello", start: -3 }, output: "hello" },
  ],
  "client.trim": [
    { note: "removes the white space of both sides", input: { value: "  x  " }, output: "x" },
    { note: "side start trims only the start", input: { value: "  x  ", side: "start" }, output: "x  " },
    { note: "side end trims only the end", input: { value: "  x  ", side: "end" }, output: "  x" },
  ],
  "client.toLower": [{ note: "gives lower case", input: { value: "AbC" }, output: "abc" }],
  "client.toUpper": [
    { note: "gives upper case", input: { value: "abc" }, output: "ABC" },
    { note: "the length can change", input: { value: "straße" }, output: "STRASSE" },
  ],
  "client.startsWith": [
    { note: "true for a prefix", input: { value: "hello", search: "he" }, output: true },
    { note: "an empty search is a prefix", input: { value: "hello", search: "" }, output: true },
  ],
  "client.endsWith": [
    { note: "true for a suffix", input: { value: "hello", search: "lo" }, output: true },
    { note: "false for a prefix", input: { value: "hello", search: "he" }, output: false },
  ],
  "client.includes": [
    { note: "true for a part of the string", input: { value: "hello", search: "ell" }, output: true },
    { note: "is case-sensitive", input: { value: "hello", search: "ELL" }, output: false },
  ],
  "client.strLength": [
    { note: "gives the length", input: { value: "hello" }, output: 5 },
    { note: "counts UTF-16 code units: an emoji is 2", input: { value: "😀" }, output: 2 },
  ],
  "client.template": [
    {
      note: "fills each {{name}} placeholder",
      input: { template: "Hi {{name}}, you are {{age}}", values: { name: "ada", age: 36 } },
      output: "Hi ada, you are 36",
    },
    {
      note: "a placeholder without a value stays",
      input: { template: "Hi {{name}} {{missing}}", values: { name: "ada" } },
      output: "Hi ada {{missing}}",
    },
    { note: "single braces are text", input: { template: "Hi {name}", values: { name: "ada" } }, output: "Hi {name}" },
  ],

  // ---------------------------------------------------------------------------
  // Type
  // ---------------------------------------------------------------------------
  "client.typeof": [
    { note: "names a string", input: { value: "x" }, output: "string" },
    { note: "names null", input: { value: null }, output: "null" },
    { note: "names an array", input: { value: [1] }, output: "array" },
    { note: "names an object", input: { value: { a: 1 } }, output: "object" },
    { note: "a missing value is undefined", input: {}, output: "undefined" },
  ],
  "client.isNull": [
    { note: "true for null", input: { value: null }, output: true },
    { note: "false for undefined", input: {}, output: false },
  ],
  "client.isUndefined": [
    { note: "true for a missing value", input: {}, output: true },
    { note: "false for null", input: { value: null }, output: false },
  ],
  "client.isNil": [
    { note: "true for null", input: { value: null }, output: true },
    { note: "true for undefined", input: {}, output: true },
    { note: "false for 0", input: { value: 0 }, output: false },
  ],
  "client.isArray": [
    { note: "true for an array", input: { value: [] }, output: true },
    { note: "false for an object with a length", input: { value: { length: 0 } }, output: false },
  ],
  "client.isObject": [
    { note: "true for an object", input: { value: { a: 1 } }, output: true },
    { note: "false for an array", input: { value: [] }, output: false },
    { note: "false for null", input: { value: null }, output: false },
  ],
  "client.isString": [
    { note: "true for a string", input: { value: "x" }, output: true },
    { note: "false for a number", input: { value: 1 }, output: false },
  ],
  "client.isNumber": [
    { note: "true for a number", input: { value: 1 }, output: true },
    { note: "false for NaN", input: { value: NaN }, output: false },
    { note: "false for a numeric string", input: { value: "1" }, output: false },
  ],
  "client.isBoolean": [
    { note: "true for false", input: { value: false }, output: true },
    { note: "false for 0", input: { value: 0 }, output: false },
  ],
  "client.coerce": [
    { note: "converts a string to a number", input: { value: "42", to: "number" }, output: 42 },
    { note: "converts a number to a string", input: { value: 42, to: "string" }, output: "42" },
    { note: "converts an empty string to false", input: { value: "", to: "boolean" }, output: false },
    { note: "puts a value that is not an array into an array", input: { value: "x", to: "array" }, output: ["x"] },
    { note: "an array stays", input: { value: [1], to: "array" }, output: [1] },
    { note: "text that is not a number gives NaN", input: { value: "abc", to: "number" }, output: NaN },
    { note: "refuses an unknown type", input: { value: 1, to: "date" }, error: "VALIDATION_ERROR" },
  ],

  // ---------------------------------------------------------------------------
  // Object
  // ---------------------------------------------------------------------------
  "client.get": [
    { note: "reads a dotted path", input: { object: { user: { name: "ada" } }, path: "user.name" }, output: "ada" },
    { note: "a missing path gives the default", input: { object: { a: 1 }, path: "b", default: "none" }, output: "none" },
    { note: "null is a value: no default", input: { object: { a: null }, path: "a", default: "none" }, output: null },
    { note: "reads only own fields", input: { object: { a: 1 }, path: "toString" }, output: undefined },
    { note: "refuses a prototype segment", input: { object: {}, path: "a.__proto__" }, error: "reaches a prototype" },
  ],
  "client.set": [
    {
      note: "sets a dotted path and makes the objects on the path",
      input: { object: { a: 1 }, path: "b.c", value: 2 },
      output: { a: 1, b: { c: 2 } },
    },
    {
      note: "a value that is not an object on the path becomes an object",
      input: { object: { a: 5 }, path: "a.b", value: 1 },
      output: { a: { b: 1 } },
    },
    { note: "refuses a prototype segment", input: { object: {}, path: "__proto__.x", value: 1 }, error: "reaches a prototype" },
  ],
  "client.merge": [
    {
      note: "a shallow merge replaces a nested object",
      input: { objects: [{ a: 1, b: { x: 1 } }, { b: { y: 2 } }] },
      output: { a: 1, b: { y: 2 } },
    },
    {
      note: "a deep merge merges the nested objects",
      input: { objects: [{ a: 1, b: { x: 1 } }, { b: { y: 2 } }], deep: true },
      output: { a: 1, b: { x: 1, y: 2 } },
    },
    {
      note: "a deep merge replaces an array",
      input: { objects: [{ list: [1, 2] }, { list: [3] }], deep: true },
      output: { list: [3] },
    },
    { note: "no objects give an empty object", input: { objects: [] }, output: {} },
  ],
  "client.keys": [
    { note: "gives the keys", input: { object: { a: 1, b: 2 } }, output: ["a", "b"] },
    { note: "an empty object has no keys", input: { object: {} }, output: [] },
  ],
  "client.values": [{ note: "gives the values", input: { object: { a: 1, b: "x" } }, output: [1, "x"] }],
  "client.entries": [
    { note: "gives the [key, value] pairs", input: { object: { a: 1, b: "x" } }, output: [["a", 1], ["b", "x"]] },
  ],
  "client.fromEntries": [
    { note: "makes an object from the pairs", input: { entries: [["a", 1], ["b", 2]] }, output: { a: 1, b: 2 } },
    { note: "the last pair of a key wins", input: { entries: [["a", 1], ["a", 2]] }, output: { a: 2 } },
  ],
  "client.pick": [
    {
      note: "keeps the given keys, and a missing key stays missing",
      input: { object: { a: 1, b: 2, c: 3 }, keys: ["a", "c", "missing"] },
      output: { a: 1, c: 3 },
    },
    { note: "picks only own fields", input: { object: { a: 1 }, keys: ["toString"] }, output: {} },
  ],
  "client.omit": [
    { note: "removes the given keys", input: { object: { a: 1, b: 2, c: 3 }, keys: ["b", "missing"] }, output: { a: 1, c: 3 } },
  ],
  "client.has": [
    { note: "true when the path has a value", input: { object: { a: { b: 1 } }, path: "a.b" }, output: true },
    { note: "false for a missing path", input: { object: { a: { b: 1 } }, path: "a.c" }, output: false },
    { note: "null is a value", input: { object: { a: null }, path: "a" }, output: true },
    { note: "reads only own fields", input: { object: { a: 1 }, path: "hasOwnProperty" }, output: false },
  ],

  // ---------------------------------------------------------------------------
  // Array
  // ---------------------------------------------------------------------------
  "client.first": [
    { note: "gives the first item", input: { items: [1, 2] }, output: 1 },
    { note: "an empty array gives undefined", input: { items: [] }, output: undefined },
  ],
  "client.last": [
    { note: "gives the last item", input: { items: [1, 2] }, output: 2 },
    { note: "an empty array gives undefined", input: { items: [] }, output: undefined },
  ],
  "client.nth": [
    { note: "gives the item at the index", input: { items: ["a", "b", "c"], index: 1 }, output: "b" },
    { note: "a negative index counts from the end", input: { items: ["a", "b", "c"], index: -1 }, output: "c" },
    { note: "an index out of range gives undefined", input: { items: ["a", "b", "c"], index: -4 }, output: undefined },
  ],
  "client.arrLength": [
    { note: "gives the number of items", input: { items: [1, 2, 3] }, output: 3 },
    { note: "an empty array has length 0", input: { items: [] }, output: 0 },
  ],
  "client.flatten": [
    { note: "flattens one level by default", input: { items: [[1], [2, [3]]] }, output: [1, 2, [3]] },
    { note: "depth sets the number of levels", input: { items: [[1], [2, [3]]], depth: 2 }, output: [1, 2, 3] },
  ],
  "client.reverse": [{ note: "reverses the order", input: { items: [1, 2, 3] }, output: [3, 2, 1] }],
  "client.sort": [
    { note: "sorts numbers by value, not as text", input: { items: [10, 9, 1] }, output: [1, 9, 10] },
    { note: "desc sorts in descending order", input: { items: [1, 3, 2], desc: true }, output: [3, 2, 1] },
    { note: "key sorts objects by a field", input: { items: [bob, ada], key: "age" }, output: [ada, bob] },
    { note: "strings sort by locale, not by code point", input: { items: ["b", "a", "C"] }, output: ["a", "b", "C"] },
  ],
  "client.slice": [
    { note: "gives the items from start to end (exclusive)", input: { items: [1, 2, 3, 4], start: 1, end: 3 }, output: [2, 3] },
    { note: "a negative start counts from the end", input: { items: [1, 2, 3, 4], start: -2 }, output: [3, 4] },
  ],
  "client.arrConcat": [
    { note: "joins the arrays in order", input: { arrays: [[1], [2, 3], []] }, output: [1, 2, 3] },
    { note: "joins only one level", input: { arrays: [[[1]], [2]] }, output: [[1], 2] },
  ],
  "client.unique": [
    { note: "removes duplicates and keeps the first", input: { items: [1, 2, 1, 3, 2] }, output: [1, 2, 3] },
    { note: "a number and its string are different", input: { items: [1, "1"] }, output: [1, "1"] },
    {
      note: "key keeps the first item of each value of the field",
      input: { items: [{ id: 1, n: "a" }, { id: 1, n: "b" }, { id: 2, n: "c" }], key: "id" },
      output: [{ id: 1, n: "a" }, { id: 2, n: "c" }],
    },
  ],
  "client.groupBy": [
    { note: "groups the items by the value of the key", input: { items: people, key: "team" }, output: { a: [ada], b: [bob] } },
    {
      note: "a group can have the name of a prototype field",
      input: { items: [{ tag: "constructor" }, { tag: "toString" }, { tag: "x" }], key: "tag" },
      output: { constructor: [{ tag: "constructor" }], toString: [{ tag: "toString" }], x: [{ tag: "x" }] },
    },
  ],
  "client.zip": [
    { note: "makes one tuple for each index", input: { arrays: [[1, 2], ["a", "b"]] }, output: [[1, "a"], [2, "b"]] },
    {
      note: "a shorter array gives undefined",
      input: { arrays: [[1, 2, 3], ["a"]] },
      output: [[1, "a"], [2, undefined], [3, undefined]],
    },
    { note: "no arrays give no tuples", input: { arrays: [] }, output: [] },
  ],
  "client.unzip": [
    { note: "makes one array for each position", input: { tuples: [[1, "a"], [2, "b"]] }, output: [[1, 2], ["a", "b"]] },
    { note: "no tuples give no arrays", input: { tuples: [] }, output: [] },
  ],
  "client.indexOf": [
    { note: "gives the index of the first match", input: { items: ["a", "b", "a"], value: "a" }, output: 0 },
    { note: "fromIndex starts the search later", input: { items: ["a", "b", "a"], value: "a", fromIndex: 1 }, output: 2 },
    { note: "gives -1 when no item matches", input: { items: ["a"], value: "z" }, output: -1 },
    { note: "compares objects by identity", input: { items: [{ a: 1 }], value: { a: 1 } }, output: -1 },
  ],
  "client.contains": [
    { note: "true when an item matches", input: { items: [1, 2], value: 2 }, output: true },
    { note: "strict: a number is not its string", input: { items: [1, 2], value: "2" }, output: false },
  ],
  "client.push": [
    { note: "adds the value at the end", input: { items: [1, 2], value: 3 }, output: [1, 2, 3] },
    { note: "an array value is one item", input: { items: [1], value: [2, 3] }, output: [1, [2, 3]] },
  ],
  "client.unshift": [{ note: "adds the value at the start", input: { items: [1, 2], value: 0 }, output: [0, 1, 2] }],
  "client.range": [
    { note: "gives the numbers from start to end (exclusive)", input: { start: 0, end: 5 }, output: [0, 1, 2, 3, 4] },
    { note: "step sets the distance", input: { start: 0, end: 10, step: 3 }, output: [0, 3, 6, 9] },
    { note: "a negative step counts down", input: { start: 5, end: 0, step: -2 }, output: [5, 3, 1] },
    { note: "step 0 gives no numbers", input: { start: 0, end: 5, step: 0 }, output: [] },
    { note: "a start after the end gives no numbers", input: { start: 5, end: 0 }, output: [] },
    { note: "refuses more items than the limit", input: { start: 0, end: MAX_RANGE_LENGTH + 1 }, error: "more than the limit" },
  ],
  "client.filter": [
    { note: "keeps the items whose field equals value", input: { items: people, key: "team", value: "a" }, output: [ada] },
    { note: "match gt compares numbers", input: { items: people, key: "age", value: 40, match: "gt" }, output: [bob] },
    { note: "match in keeps the items in values", input: { items: [1, 2, 3, 4], values: [2, 4], match: "in" }, output: [2, 4] },
    {
      note: "match startsWith compares strings",
      input: { items: ["apple", "banana", "avocado"], value: "a", match: "startsWith" },
      output: ["apple", "avocado"],
    },
    { note: "invert keeps the other items", input: { items: people, key: "team", value: "a", invert: true }, output: [bob] },
  ],
  "client.where": [
    { note: "keeps the items whose fields all match", input: { items: people, where: { team: "b", age: 41 } }, output: [bob] },
    { note: "an empty where keeps all items", input: { items: people, where: {} }, output: people },
  ],
  "client.pluck": [
    { note: "gives the field of each item", input: { items: people, key: "name" }, output: ["ada", "bob"] },
    { note: "a missing field gives undefined", input: { items: [{ a: 1 }, {}], key: "a" }, output: [1, undefined] },
  ],
  "client.arrPick": [
    {
      note: "keeps the given fields of each item",
      input: { items: [{ id: 1, name: "a", extra: 0 }], keys: ["id", "name", "missing"] },
      output: [{ id: 1, name: "a" }],
    },
    { note: "picks only own fields", input: { items: [{ id: 1 }], keys: ["id", "toString"] }, output: [{ id: 1 }] },
  ],
  "client.arrOmit": [
    {
      note: "removes the given fields of each item",
      input: { items: [{ id: 1, secret: "x" }, { id: 2 }], keys: ["secret"] },
      output: [{ id: 1 }, { id: 2 }],
    },
  ],
  "client.partition": [
    {
      note: "splits the items by the value of the field",
      input: { items: people, key: "team", value: "a" },
      output: { truthy: [ada], falsy: [bob] },
    },
    {
      note: "without value, the truth of the field decides",
      input: { items: [{ ok: true }, { ok: 0 }, { ok: "y" }], key: "ok" },
      output: { truthy: [{ ok: true }, { ok: "y" }], falsy: [{ ok: 0 }] },
    },
  ],
  "client.count": [
    { note: "without key, gives the number of items", input: { items: [1, 2, 3] }, output: 3 },
    { note: "counts the items whose field equals value", input: { items: people, key: "team", value: "a" }, output: 1 },
    {
      note: "without value, counts the items with a truthy field",
      input: { items: [{ ok: true }, { ok: false }, {}], key: "ok" },
      output: 1,
    },
  ],

  // ---------------------------------------------------------------------------
  // Meta
  // ---------------------------------------------------------------------------
  "client.import": [
    {
      note: "parses a call into its runtime form",
      input: { json: '{"$proc":["client","add"],"input":{"a":1,"b":2}}' },
      output: { procedure: runtimeRef("add", { a: 1, b: 2 }), success: true },
    },
    {
      note: "text that is not JSON gives an error result",
      input: { json: "not json" },
      output: { procedure: null, success: false, error: expect.stringContaining("JSON") },
    },
    {
      note: "path needs fs.read",
      input: { path: "program.json" },
      output: { procedure: null, success: false, error: expect.stringContaining("requires fs.read") },
    },
    {
      note: "no json and no path give an error result",
      input: {},
      output: { procedure: null, success: false, error: "Either json or path parameter is required" },
    },
    {
      note: "JSON that is not a procedure reference is not a success",
      input: { json: "42" },
      output: expect.objectContaining({ success: false }),
      defect:
        "The schema says success is 'True when the text is a valid procedure reference', but each JSON value gives success true.",
    },
  ],
  "client.export": [
    {
      note: "writes a call as JSON",
      input: { procedure: call("add", { a: 1, b: 2 }) },
      output: { json: '{"$proc":["client","add"],"input":{"a":1,"b":2}}', success: true },
    },
    {
      note: "writes the runtime form as a $proc call, and keeps $name",
      input: { procedure: { ...runtimeRef("add", { a: 1, b: 2 }), $name: "sum" } },
      output: { json: '{"$proc":["client","add"],"input":{"a":1,"b":2},"$name":"sum"}', success: true },
    },
    {
      note: "pretty indents with 2 spaces",
      input: { procedure: call("abs", { value: -1 }), pretty: true },
      output: {
        json: '{\n  "$proc": [\n    "client",\n    "abs"\n  ],\n  "input": {\n    "value": -1\n  }\n}',
        success: true,
      },
    },
  ],
  "client.eval": [
    { note: "runs a path with the input", input: { procedure: ["client", "add"], input: { a: 1, b: 2 } }, output: 3 },
    {
      note: "the input goes over the input of a call",
      input: { procedure: call("add", { a: 1, b: 2 }), input: { b: 10 } },
      output: 11,
    },
    {
      note: "the calls of the input run first",
      input: { procedure: ["client", "add"], input: { a: call("multiply", { a: 2, b: 3 }), b: 1 } },
      output: 7,
    },
    { note: "refuses a value that is not a reference", input: { procedure: "client.add" }, error: "Invalid procedure reference" },
  ],
  "client.parseJson": [
    { note: "parses JSON", input: { json: '{"a":[1,2]}' }, output: { a: [1, 2] } },
    {
      note: "makes a call into its runtime form by default",
      input: { json: '{"$proc":["client","add"],"input":{"a":1,"b":2}}' },
      output: runtimeRef("add", { a: 1, b: 2 }),
    },
    {
      note: "parseProcedures false keeps a call as plain JSON",
      input: { json: '{"$proc":["client","add"],"input":{"a":1,"b":2}}', parseProcedures: false },
      output: { $proc: ["client", "add"], input: { a: 1, b: 2 } },
    },
    { note: "refuses text that is not JSON", input: { json: "{bad" }, error: "JSON" },
  ],
  "client.stringifyJson": [
    { note: "writes JSON", input: { value: { a: 1 } }, output: '{"a":1}' },
    { note: "pretty indents with 2 spaces", input: { value: { a: 1 }, pretty: true }, output: '{\n  "a": 1\n}' },
    { note: "indent sets the indentation", input: { value: { a: 1 }, indent: "\t" }, output: '{\n\t"a": 1\n}' },
    {
      note: "writes the runtime form of a call as a $proc call",
      input: { value: { step: runtimeRef("add", { a: 1, b: 2 }) } },
      output: '{"step":{"$proc":["client","add"],"input":{"a":1,"b":2}}}',
    },
  ],
  "client.lookup": [
    {
      note: "gives the metadata of a procedure",
      input: { path: ["client", "abs"] },
      output: {
        exists: true,
        path: ["client", "abs"],
        metadata: { description: "Absolute value", tags: ["core", "math"], effects: { reads: [], writes: [] } },
      },
    },
    { note: "a missing procedure does not exist", input: { path: ["no", "such"] }, output: { exists: false, path: ["no", "such"] } },
  ],
};

// =============================================================================
// The runner
// =============================================================================

const registry = new ProcedureRegistry();
for (const procedure of allCoreProcedures) registry.register(procedure);

/** The message of a schema that refuses the value, or undefined when the schema accepts it. */
async function refusal(schema: ProcedureSchema, value: unknown): Promise<string | undefined> {
  const result = await validateSchema(schema, value);
  return result.ok ? undefined : result.message;
}

/**
 * This function runs a procedure as a host does, and gives its output and each item: one item for
 * a value, all items for a stream.
 */
async function invoke(procedure: AnyProcedure, input: unknown): Promise<{ output: unknown; items: unknown[] }> {
  const result = await invokePath(procedure.path, input, { registry });
  const items: unknown[] = [];
  for await (const item of outputItems(result)) items.push(item);
  return { output: result.kind === "value" ? items[0] : items, items };
}

/** Each core procedure declares the effects of its handler (CAPABILITIES-2026-10). */
function expectEffects(procedure: AnyProcedure): void {
  const effects = (procedure.metadata as { effects?: { reads?: unknown; writes?: unknown } } | undefined)?.effects;
  expect(effects, `${pathToKey(procedure.path)} declares no effects`).toBeDefined();
  expect(Array.isArray(effects?.reads) && Array.isArray(effects?.writes)).toBe(true);
}

async function runExample(key: string, example: Example): Promise<void> {
  const procedure = registry.get(key.split("."));
  if (!procedure) throw new Error(`The registry has no procedure ${key}`);
  expectEffects(procedure);

  if ("error" in example) {
    const error = await invoke(procedure, example.input).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error, "the call must fail").toBeInstanceOf(Error);
    const { code, message } = error as Error & { code?: unknown };
    expect(code === example.error || message.includes(example.error), `${String(code)}: ${message}`).toBe(true);
    return;
  }

  expect(await refusal(procedure.input, example.input), "the input schema refuses the input").toBeUndefined();
  const { output, items } = await invoke(procedure, example.input);
  for (const item of items) {
    expect(await refusal(procedure.output, item), "the output schema refuses the output").toBeUndefined();
  }
  expect(output).toEqual(example.output);
}

// =============================================================================
// The tests
// =============================================================================

describe("the catalog of the core procedures (R29)", () => {
  it("has an entry for each registered core procedure", () => {
    const missing = registry
      .getAll()
      .map((procedure) => pathToKey(procedure.path))
      .filter((key) => !Object.hasOwn(CATALOG, key));
    expect(missing).toEqual([]);
  });

  it("names only procedures that exist", () => {
    const unknown = Object.keys(CATALOG).filter((key) => !registry.get(key.split(".")));
    expect(unknown).toEqual([]);
  });

  it("has an example for each entry", () => {
    const empty = Object.entries(CATALOG)
      .filter(([, examples]) => examples.length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});

describe("the defects that the catalog found (R29)", () => {
  const run = async (name: string, input: unknown): Promise<unknown> =>
    (await invoke(registry.get(["client", name])!, input)).output;

  it("client.replace gives the replacement as text, without the $ patterns of String.replace", async () => {
    for (const replacement of ["$$", "$&", "$`", "$'", "$1"]) {
      expect(await run("replace", { value: "a-b", search: "-", replace: replacement })).toBe(`a${replacement}b`);
      expect(await run("replace", { value: "a-b", search: "-", replace: replacement, all: true })).toBe(`a${replacement}b`);
    }
  });

  it("client.groupBy accepts a group with the name of a field of Object.prototype", async () => {
    const names = ["constructor", "toString", "hasOwnProperty", "valueOf"];
    const grouped = (await run("groupBy", { items: names.map((tag) => ({ tag })), key: "tag" })) as Record<string, unknown>;
    expect(Object.keys(grouped)).toEqual(names);
    for (const name of names) expect(grouped[name]).toEqual([{ tag: name }]);
    expect(typeof Object.prototype.toString).toBe("function");
  });

  it("client.arrPick picks an own field with the name of a prototype field, and no inherited field", async () => {
    const picked = await run("arrPick", { items: [{ constructor: 1, a: 2 }, { a: 3 }], keys: ["constructor", "toString"] });
    const expected: Array<Record<string, unknown>> = [{ constructor: 1 }, {}];
    expect(picked).toEqual(expected);
  });

  it("client.template describes the {{name}} placeholders that it fills", () => {
    const schema = jsonSchemaOf(registry.get(["client", "template"])!.input, { io: "input" }) as {
      properties?: Record<string, { description?: string }>;
    };
    expect(schema.properties?.["template"]?.description).toContain("{{name}}");
  });
});

for (const [key, examples] of Object.entries(CATALOG)) {
  describe(key, () => {
    for (const example of examples) {
      if ("defect" in example && example.defect !== undefined) {
        // The documented behavior is missing: the test passes while the example fails
        it.fails(`${example.note} (defect: ${example.defect})`, () => runExample(key, example));
      } else {
        it(example.note, () => runExample(key, example));
      }
    }
  });
}
