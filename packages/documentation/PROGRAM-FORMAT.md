# The program format

This document specifies the procedure-as-data format. It is the JSON that `client.exec()`, the control-flow procedures, `procedure.define` and the Composer of the site use. The document is normative for the core of commit `8a9e7c7` ("one interpreter") and later. Each rule names the code and the test that examine it.

The interpreter is one function: `hydrateInput()` in [`packages/client/src/procedures/ref.ts`](../client/src/procedures/ref.ts). The control-flow procedures in [`core/index.ts`](../client/src/procedures/core/index.ts) use it for their operands. `procedure.define` ([`define-procedure.ts`](../client/src/procedures/define-procedure.ts)) uses it for the body of a defined procedure.

## How to try the examples

Each example is a program for `client.exec()`. Use the setup below. By default, the core registers only its control-flow procedures. Thus the setup registers all core procedures:

```ts
import { Client, LocalTransport, PROCEDURE_REGISTRY, allCoreProcedures } from "@procedures/client";

for (const procedure of allCoreProcedures) {
  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);
}
const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

console.log(await client.exec(program));
```

The Composer of the site accepts the same programs: paste the JSON into its JSON tab. The comment after each example gives the result.

## 1. A call

A call is an object with a `$proc` key. The code names it a procedure ref ("ref"). The value of `$proc` is the path of the procedure, as an array of strings. The `input` key gives the input. A call without `input` gets `undefined`.

```json
{ "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } }
// 3
```

A call can also have `$name` (section 4) and `$when` (section 5). The interpreter ignores the other keys of a call.

The runtime form of a call is a `ProcedureRef`. It is an object with the `PROCEDURE_SYMBOL` tag, a `path` and an `input`, and the `proc()` builder makes it. These functions change one form into the other: `toJson()`, `fromJson()`, `parseProcedureJson()`, `stringifyProcedureJson()` and `extractTemplate()`. They keep `$name`, `$when` and `$literal` (test: `ref.hydrate.test.ts`, "CORE-11").

## 2. A program

A program is a call. `client.exec()` starts it. `client.exec()` also accepts a path and an input: `client.exec(["client", "add"], { a: 1, b: 2 })`. An array or another value at the root is an error: `exec() requires a ProcedureRef, $proc JSON, or procedure path array`.

`client.exec(program, input)` puts the fields of `input` over the fields of the program's input. The test is "Client.exec(ref, input)" in `core/semantics.test.ts`.

`client.exec()` starts a root call also when the call has `$when`. Section 11 compares this with `procedure.define`.

## 3. Hydration: the calls in an input start first

Before a procedure starts, the interpreter does each call in its input. It puts the result in the place of the call. This step is "hydration".

```json
{
  "$proc": ["client", "multiply"],
  "input": { "a": { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } }, "b": 10 }
}
// 30
```

The rules of hydration:

- **Order.** The calls of an input start one at a time. They go from the first key to the last key, and from the first item to the last item. A call starts after the calls of its own input. The test is "the default runs sibling refs in order" in `ref.hydrate.test.ts`.
- **Parallel.** The API option `HydrateOptions.parallel: true` starts the sibling refs at the same time. A program cannot set this option. Use `client.parallel` for that.
- **Plain data.** Hydration examines plain objects and arrays only. A `Date`, a `Map`, a typed array or an instance of a class stays the same object. A subtree with no call and no `$ref` stays the same object. The test is "values that are not plain objects stay unchanged".
- **Depth.** Calls can nest in the input of a call to a depth of 10 levels below the root call. A deeper call is an error: `Hydration depth exceeded maximum of 10`. Plain data does not count toward this limit.
- **Size.** Plain data deeper than 1000 levels is an error. An input that contains itself is an error too. The tests are "refs nested deeper than the limit fail" and "a cyclic input fails with a clear message".
- **Raw input.** Some procedures get their input raw: the interpreter does not start the calls of the input. Section 9 gives the list.

## 4. Names: `$name` and `$ref`

A `$ref` object reads a value that has a name in a scope. The value of `$ref` is a name and optional field names, with dots between them: `"user.name"`.

```json
{
  "$proc": ["client", "chain"],
  "input": {
    "steps": [
      { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 }, "$name": "sum" },
      { "$proc": ["client", "multiply"], "input": { "a": { "$ref": "sum" }, "b": 10 } },
      { "$proc": ["client", "add"], "input": { "a": { "$ref": "$last" }, "b": { "$ref": "sum" } } }
    ]
  }
}
// { "results": [3, 30, 33], "final": 33 }
```

These names exist:

| Name | Where | Value |
|---|---|---|
| the `$name` of a step | the later steps of `client.chain` | the result of that step |
| `$last` | the steps of `client.chain` after the first step | the result of the step before |
| `item` (or the name in `as`) and `index` | the `fn` of `client.map` | the item and its position |
| `acc`, `item` and `index` | the `fn` of `client.reduce` | the accumulator, the item and its position |
| `error` | the `catch` operand of `client.tryCatch` | the error message |
| `input` | the body of a procedure that `procedure.define` made | the input of the procedure |

The rules:

- **Only chain steps put a `$name` in the scope.** A `$name` on another call is not readable. The tests are in `core/semantics.test.ts`.
- **Scopes nest.** A `$ref` in nested control flow reads the names of the outer chains, `map`, `reduce` and the defined body. The innermost scope with the name wins. The tests are "CORE-13: outer chain names inside nested control flow".
- **An unknown name is an error.** In a scope, a `$ref` with an unknown first segment stops the program: `Unknown $ref name "usr" in "usr"`. Before October 2026, it gave `undefined` and no error. The test is "an unknown $ref name in a chain is an error".
- **A missing field is `undefined`.** When the name exists, a missing field gives `undefined`, not an error. The interpreter reads only the own fields of an object: `"user.constructor"` gives `undefined`.
- **With no scope, a `$ref` object is data.** Outside all scopes, the object stays as it is. The input of the root call is outside all scopes. Thus a JSON Schema `$ref` goes through. The test is "without a scope, a $ref object stays (a JSON Schema reference)".

```json
{ "$proc": ["client", "identity"], "input": { "value": { "$ref": "#/definitions/point" } } }
// { "$ref": "#/definitions/point" }
```

## 5. `$when`: a call that waits

`$when` tells when a call starts. Without `$when`, a call starts during hydration (`"$immediate"`).

| Value | Effect |
|---|---|
| `"$immediate"` or no `$when` | The call starts during hydration. |
| `"$never"` | The call is data, with its full input. Nothing in it starts. |
| `"$parent"` | The call is data for the procedure that gets it. The calls of its input start during hydration, unless its procedure takes raw input. |
| a different string | The call is data until a runner gives that name. Then it starts. |

```json
{ "$proc": ["client", "identity"], "input": { "value": { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 }, "$when": "$never" } } }
// { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 }, "$when": "$never" }
```

A deferred call is data also in a list and as a step of `client.chain`. A `$never` step of a chain gives the step itself as its result. A list that has a deferred call is not an implicit chain (section 7).

A runner is a procedure that hydrates a deferred call itself and gives a context name. Two runners exist. `core.catch` (`client-lib`) gives `"catch"`, and `dag.traverse` gives `"dag.traverse"`. A `$name` is not a context name. A deferred call is data at all depths. The test is "a ref deferred to a name is data at every depth" in `ref.hydrate.test.ts`.

## 6. `$literal`: data that looks like a call

`{ "$literal": value }` gives `value` without hydration. The object must have `$literal` as its only key.

```json
{ "$proc": ["client", "identity"], "input": { "value": { "$literal": { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } } } } }
// { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } }
```

Use `$literal` for data with a `$proc` array or a `$ref` string. A JSON Schema in a scope is an example.

## 7. Implicit chains

An array of calls can operate as one `client.chain`. Then the result is the chain output, `{ results, final }`, and the steps can use `$name` and `$last`.

```json
{
  "$proc": ["client", "identity"],
  "input": {
    "value": [
      { "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } },
      { "$proc": ["client", "multiply"], "input": { "a": { "$ref": "$last" }, "b": 10 } }
    ]
  }
}
// { "results": [3, 30], "final": 30 }
```

The exact rule is in `hydrateValue()` in `ref.ts`. An array is an implicit chain when all of these conditions are true:

1. The array has one item or more, and each item is a call that starts during this hydration. A `$never` call, a `$parent` call or a call that waits for a context name makes the array a list.
2. The array is a value where a hydration starts (a "hydration root"), or it is in the plain objects and arrays of that value.
3. The array is not in the input of a call. The input of a call does not make an implicit chain.
4. The array is not the steps of an implicit chain.

The hydration roots are:

- The input of the root call of `client.exec()`.
- An operand of a control-flow procedure that is not a call (section 8).
- The body of a defined procedure. The body is a call, thus its input makes no implicit chain (section 11).

In the input of a nested call, the same array stays a list of results:

```json
{
  "$proc": ["client", "identity"],
  "input": {
    "value": {
      "$proc": ["client", "identity"],
      "input": { "value": [{ "$proc": ["client", "add"], "input": { "a": 1, "b": 2 } }, { "$proc": ["client", "add"], "input": { "a": 3, "b": 4 } }] }
    }
  }
}
// [3, 7]
```

The test `analysis.test.ts` of the site examines each case of this rule with the real runtime.

## 8. The control-flow procedures

The control-flow procedures get their input raw. They start their operands themselves, in the scope of the caller. An operand that is a call starts after the calls of its input. An operand that is a different value is hydrated as a program. Its calls start, its `$ref` values read the scope, and an array of calls in it is an implicit chain.

| Procedure | Operands | Order | Result |
|---|---|---|---|
| `client.chain` | `steps` | One at a time. A step that is a call gets `$name` and `$last` (section 4). With `passThrough: true`, a step that has no `input` gets the result of the step before. The first step gets `initialInput`. | `{ results, final }` |
| `client.parallel` | `tasks` | At the same time, with `concurrency`. A failure goes into `errors`, unless `failFast` is true. | `{ results, allSucceeded, errors }` |
| `client.conditional` | `condition`, then `then` or `else` | Only the selected branch starts. | the value of the branch |
| `client.tryCatch` | `try`, then `catch` after an error | `catch` can read `{ "$ref": "error" }`. | `{ success, value, error? }` |
| `client.and`, `client.or` | `values` | One at a time. They stop at the first falsy value (`and`) or truthy value (`or`). | that value, or the last value |
| `client.map` | each item of `items`, then `fn` for each item | Items one at a time. `fn` reads `item` (or `as`) and `index`. | `{ results }` |
| `client.reduce` | each item of `items`, `initial`, then `fn` | `fn` reads `acc`, `item` and `index`. | the last accumulator |

```json
{
  "$proc": ["client", "conditional"],
  "input": {
    "condition": { "$proc": ["client", "gt"], "input": { "a": 5, "b": 3 } },
    "then": { "total": { "$proc": ["client", "add"], "input": { "a": 5, "b": 3 } } },
    "else": "small"
  }
}
// { "total": 8 }
```

```json
{ "$proc": ["client", "map"], "input": { "items": [1, 2, 3], "fn": { "$proc": ["client", "multiply"], "input": { "a": { "$ref": "item" }, "b": { "$ref": "index" } } } } }
// { "results": [0, 2, 6] }
```

```json
{ "$proc": ["client", "tryCatch"], "input": { "try": { "$proc": ["client", "throw"], "input": { "message": "disk full" } }, "catch": { "$ref": "error" } } }
// { "success": false, "value": "disk full", "error": "disk full" }
```

Details:

- **The truth of a condition.** `client.conditional` reads the `value` field of an object: `{ "value": 0 }` is false. For other values, the JavaScript rules apply.
- **Items.** `client.map` and `client.reduce` hydrate each item of an `items` array separately. An item that is a call gives its result. An item that is an array of calls is an implicit chain. When `items` is a call or a `$ref`, its result must be an array.
- **Without `fn`.** `client.map` gives the hydrated items. `client.reduce` gives the hydrated `initial`: a call in it starts.
- **The parent context.** `chain`, `parallel`, `conditional`, `and` and `or` add the `cwd` and `node` fields of their input to the input of each operand call.
- **A branch that is an array.** A branch of `conditional` or an operand of `tryCatch` that is an array of calls is a chain. The test is `analysis.test.ts` of the site.

## 9. Procedures that take raw input

Hydration gives a procedure its input raw when the registry has the procedure, and one of these conditions is true:

- It is a control-flow procedure (section 8). The full path must agree, thus a user procedure `foo.map` takes ordinary input.
- Its metadata has the tag `runs-refs`: it starts the refs of its input. Examples are `client.eval`, `procedure.define`, `dag.traverse` and `core.catch`. `client.eval` hydrates the input of its call like `exec()`, in the scope of the caller: the calls and the `$ref` values of that input start.
- Its metadata has the tag `raw-input`: it takes refs as data and does not start them. Examples are `client.export` and `client.stringifyJson`.

The registry of the caller decides (`rawInputRule()`). For a path that the registry does not have, only the control-flow paths take raw input. A raw input carries the scope of the caller, so nested control flow can read the outer names. The tests are "CORE-5" in `core/semantics.test.ts`.

A **data-driven** procedure starts the refs that its input or other data chooses. The control-flow procedures, the `runs-refs` procedures and the procedures that `procedure.define` made are data-driven. A server with an `expose` rule lets a data-driven procedure use only the exposed procedures. The MCP server is such a server (`isDataDriven()`, `invoke.ts`).

## 10. `procedure.define`

`procedure.define` makes a procedure from a program, the "aggregation". The body of the procedure operates each time the procedure starts. The body reads the input of the procedure as `{ "$ref": "input" }`, and a field as `{ "$ref": "input.x" }`.

```json
{
  "$proc": ["procedure", "define"],
  "input": {
    "path": ["math", "double"],
    "aggregation": { "$proc": ["client", "multiply"], "input": { "a": { "$ref": "input.x" }, "b": 2 } }
  }
}
```

After this program, `client.exec(["math", "double"], { x: 21 })` gives `42`. A body can use all the rules of this document: chains, `$last`, `map` with `item`, and nested calls.

The rules (tests: "procedure.define through a client" in `define-procedure.test.ts`):

- The aggregation must be a call.
- The body operates exactly as `client.exec()` operates the same program. The root call starts, also when it has `$when`. The input of the root call is a hydration root: an array of calls in that input is a chain (section 7). The function `prepareRootCall()` gives this behavior to `exec()` and to the body.
- A name without `input.` does not read an input field. `{ "$ref": "x" }` is an unknown name. Write `{ "$ref": "input.x" }`.
- `procedure.define` takes raw input (`runs-refs`). Nothing in the body starts at definition time.
- The new procedure goes into the registry of the caller. Its input and its output accept any value.
- `replace: true` replaces only a procedure that `procedure.define` made. A code procedure stays.
- A define that fails changes nothing.
- `procedure.delete` unregisters a defined procedure. It refuses a code procedure.
- A defined procedure is data-driven (section 9).

## 11. Open questions and known differences

These points are not decided. Each point gives the behavior at the time of commit `5c16b25`.

The owner decided the root of a defined body in October 2026 (docs review DOC-3): a body operates as `client.exec()` operates (section 10). Before, a body hydrated the aggregation itself. Thus an array of calls in the input of its root call was a list of results. A root with `$when: "$never"` gave the call as data.

- **A context name on a chain step.** A step of `client.chain` with `$when: "$parent"` or a context name starts: the chain is the procedure that gets the step. Only a `$never` step is data.
- **Parallel hydration.** A program cannot set `parallel: true`. Only `client.parallel` starts refs at the same time.
- **The scope and a remote call.** A scope does not go over a transport. A control-flow procedure on a different host cannot read the names of the caller.
- **`$name` as a context.** A `$name` does not make a context for `$when`. Only the runners give context names (`"catch"` and `"dag.traverse"`).

## Appendix A: differences from the behavior before October 2026

The deep dive of October 2026 replaced three `$ref` interpreters with one. These changes can break a program that operated correctly before. [deep-dive-2026-10/STATUS.md](./deep-dive-2026-10/STATUS.md) gives the commits.

| Before | After | Finding |
|---|---|---|
| `client.and` and `client.or` tested the raw operands. A call is an object, thus it was always true, and no operand started. | The operands start in order. The result is the value that decides. | CORE-1 |
| `procedure.define` put an input field in the place of each `$ref` before the body started. `$last`, the step names, `item` and `acc` became `undefined`. | The body has the scope name `input`. All names keep their meaning. | CORE-4 |
| A `{ "$ref": "x" }` in a body read the input field `x`. | It is an unknown name. Write `input.x`. | CORE-4 |
| The last path segment selected raw input, so a user procedure `foo.map` got raw input. `exec()` of `procedure.define` started the body at definition time. | The registered procedure decides (section 9). | CORE-5 |
| The JSON functions removed `$name` and `$when`. A `$never` call started after `client.parseJson`. | They keep the two fields. | CORE-11 |
| A named `$when` context changed with the depth of the call. `$never` kept the call but not its input. | A deferred call is data at all depths. `$never` keeps its full input. | CORE-11 |
| The depth limit of 10 counted plain data, so 12 levels of JSON failed. A `Date` became `{}`. | Only nested calls count toward the limit. Values that are not plain data stay unchanged. `$literal` exists. | CORE-12 |
| Sibling calls started at the same time. | They start one at a time, in order. | CORE-12 |
| A `conditional` branch in a chain got the object `{ "$ref": "x" }`. | Nested control flow reads the outer names. | CORE-13 |
| An unknown `$ref` name gave `undefined`. | It is an error in a scope. | SITE-9 |
| `client.conditional` gave a branch that was not one call as raw data. Nothing in it started. | Each operand is hydrated as a program. | one interpreter |
| An implicit chain started its calls at the same time, then `client.chain` got their results. | `client.chain` gets the calls and starts them in order. | architecture review 3.4 |
| `client.range` from `1e17` to `2e17` did not stop. | A range has 1 000 000 items at most, with finite bounds. | SITE-6 |
| An array of `$never` calls was an implicit chain, and its calls started. A `$never` step of `client.chain` started. | A deferred call is data in a list and as a chain step. | DOC-1 |
| `client.eval` gave the raw input to its call. `add` with a nested call gave `"[object Object]1"`. | `client.eval` hydrates the input of its call like `exec()`. | DOC-2 |
| `client.reduce` without `fn` gave `initial` raw. `client.chain` ignored `passThrough` and `initialInput`. | `initial` is hydrated, and `passThrough` operates. | DOC-4 |
| `procedure.list` and `procedure.get` gave only the defined procedures, or the whole registry when `client-procedure` was loaded. | One implementation for the whole registry, with `runtime: true` for the defined procedures. | DOC-6 |
| A defined body hydrated its root call as a nested call. A root `$when` applied, and an array of calls in the root input was a list of results. | A body operates as `client.exec()` operates the same program. | DOC-3 |
