# The program format

This document specifies the procedure-as-data format. It is the JSON that `client.exec()`, the control-flow procedures, `procedure.define` and the Composer of the site use. The document is normative for the core of commit `8a9e7c7` ("one interpreter") and later. Each rule names the code and the test that examine it.

**Revision 2 (October 2026, roadmap item M14).** A program is a run document of the kernel [coeval](https://github.com/mark1russell7/coeval) (decisions D9, D10, D12 and D13). The `$proc` form is a short form: [`program.ts`](../client/src/procedures/program.ts) changes it into a run document, and the kernel operates the document in one run. The rules of sections 1 to 11 did not change. Section 13 gives the run document and the run.

`client.exec()`, `hydrateInput()`, the control-flow procedures in [`core/index.ts`](../client/src/procedures/core/index.ts) and the body of a procedure that `procedure.define` made ([`define-procedure.ts`](../client/src/procedures/define-procedure.ts)) use the same run.

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

A program is a call. `client.exec()` starts it. `client.exec()` also accepts a path and an input: `client.exec(["client", "add"], { a: 1, b: 2 })`. It also accepts a program in the envelope form (section 11). An array or another value at the root is an error: `exec() requires a ProcedureRef, $proc JSON, or procedure path array`.

`client.exec(program, input)` puts the fields of `input` over the fields of the program's input. The test is "Client.exec(ref, input)" in `core/semantics.test.ts`.

`client.exec()` starts a root call also when the call has `$when`. Section 12 compares this with `procedure.define`.

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

A deferred call is data also in a list and as an operand of each control-flow procedure. Examples are a step of `client.chain`, a branch, a try, a task and the `fn` of `client.map`. A `$never` operand gives the call itself as its result. A list that has a deferred call is not an implicit chain (section 7).

A runner is a procedure that hydrates a deferred call itself and gives a context name. One runner exists: `dag.traverse` (`client-dag`) gives `"dag.traverse"`. The control flow `client.tryCatch` is not a runner: it starts its operands itself and gives no name. A `$name` is not a context name. A deferred call is data at all depths. The test is "a ref deferred to a name is data at every depth" in `ref.hydrate.test.ts`.

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
- The body of a defined procedure. The body is a call, thus its input makes no implicit chain (section 12).

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
- **A `fn` that is not one call.** `client.map` and `client.reduce` give an error.
- **The parent context.** `chain`, `parallel`, `conditional`, `and` and `or` add the `cwd` and `node` fields of their input to the input of each operand call.
- **A branch that is an array.** A branch of `conditional` or an operand of `tryCatch` that is an array of calls is a chain. The test is `analysis.test.ts` of the site.

## 9. Procedures that take raw input

Hydration gives a procedure its input raw when the registry has the procedure, and one of these conditions is true:

- It is a control-flow procedure (section 8). The full path must agree, thus a user procedure `foo.map` takes ordinary input.
- Its metadata has the tag `runs-refs`: it starts the refs of its input. Examples are `client.eval`, `procedure.define` and `dag.traverse`. `client.eval` hydrates the input of its call like `exec()`, in the scope of the caller: the calls and the `$ref` values of that input start.
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

## 11. The envelope form

The envelope form is a second form of a program. It comes from the design repository [coeval](https://github.com/mark1russell7/coeval), decisions D6, D9, D10 and D12. A document of coeval is an envelope: `{ "type": T, "value": V }`. The header of an envelope can also have the keys `name` and `own`.

`client.exec()` and `client.execStream()` accept the two forms. The functions of [`envelope.ts`](../client/src/procedures/envelope.ts) change one form into the other form. They read the envelopes with the helpers of `@mark1russell7/coeval`:

- `isEnvelopeProgram(value)` gives `true` if a value is a program in the envelope form.
- `fromEnvelopeProgram(program)` changes a program in the envelope form into the `$proc` form.
- `toEnvelopeProgram(program)` changes a program in the `$proc` form into the envelope form. A tool can use it to show a program.

This program is the program of section 4, in the envelope form:

```json
{
  "type": ["client", "chain"],
  "value": {
    "steps": [
      { "type": ["client", "add"], "value": { "a": 1, "b": 2 }, "name": "sum" },
      { "type": ["client", "multiply"], "value": { "a": { "type": "ref", "value": ["names", "sum"] }, "b": 10 } },
      {
        "type": ["client", "add"],
        "value": { "a": { "type": "ref", "value": ["names", "last"] }, "b": { "type": "ref", "value": ["names", "sum"] } }
      }
    ]
  }
}
// { "results": [3, 30, 33], "final": 33 }
```

The table gives each part of a program in the two forms:

| Envelope form | `$proc` form |
|---|---|
| `{ "type": ["client", "add"], "value": input }` | `{ "$proc": ["client", "add"], "input": input }` |
| `{ "type": { "type": "ref", "value": ["world", "client", "add"] }, "value": input }` | `{ "$proc": ["client", "add"], "input": input }` |
| `{ "type": ["client", "add"], "value": null }` | `{ "$proc": ["client", "add"] }` |
| the header `"name": "sum"` of a call | `"$name": "sum"` |
| `{ "type": "ref", "value": ["names", "sum", "total"] }` | `{ "$ref": "sum.total" }` |
| `{ "type": "ref", "value": ["names", "last"] }` | `{ "$ref": "$last" }` |
| `{ "type": "literal", "value": x }`, or the alias `{ "type": "lit", "value": x }` | `{ "$literal": x }` |
| an object with a `$proc`, `$ref` or `$literal` key | `{ "$literal": object }` |
| no envelope form | `$when` |

The rules (test: `envelope.test.ts`):

- **The root decides the form.** `client.exec()` changes an envelope at the root into the `$proc` form. Then the kernel operates the program (section 13). In the input of a `$proc` program, an envelope is data. Thus a `$proc` program gives the same result as before.
- **A call.** A call is an object with the keys `type` and `value`. It can also have the header keys `name` and `own`, and no other keys. Its type is the path of a procedure: an array of one or more strings. A ref into the world is also a type. The value is the input.
- **A ref and a literal.** The type `"ref"` is a ref, and the type `"literal"` is a literal. The type `"lit"` is an alias of `"literal"`: it is the kind of the kernel (coeval D12). The functions of the client write the type `"literal"`. Another text type is data.
- **An array as a type.** An array with the one key `"ref"` or `"lit"` names the same kind. The array `["literal"]` is a call, as in version 0.23.0.
- **A call without input.** A call with the value `null` has no input. Its procedure gets `undefined`, as a `$proc` call without `input` gets (section 1). With `passThrough`, `client.chain` gives such a step the result of the step before. For the input `null`, write `{ "type": "literal", "value": null }`.
- **The header.** Only a call has a header. The header `name` gives the `$name` of the call. A client program has no own entries: a call with the key `own` is an error.
- **A reference.** The value of a ref is a path: `["names", name, field, ...]`. Each key is a string without a dot, or an integer of 0 or more. The name `last` reads the result of the step before. The other names are the names of section 4, and they are in the root `names`. A ref with the root `self`, `world`, `event` or `caps` is an error.
- **Data.** In an envelope program, the `$proc` form is data. Each object with a `$proc`, `$ref` or `$literal` key goes into a `$literal`. A runtime `ProcedureRef` is data too. An envelope of a different type is data, for example `{ "type": "point", "value": 3 }`. The calls and the refs in its value operate.
- **Data with the shape of a call.** Put data with the shape of a call, a ref or a literal into a literal.
- **No `$when`.** The envelope form has no `$when`. A program that needs `$when` keeps the `$proc` form.
- **The input of `exec()`.** `client.exec(program, input)` puts the fields of `input` over the fields of the converted input. This is the rule of a `$proc` program (section 2). The function does not change `input` itself.
- **The other direction.** `toEnvelopeProgram()` refuses a program that the envelope form cannot keep. Such a program has a call with `$when` or with other keys, or a ref to a step with the name `last`.
- **The round trip.** `fromEnvelopeProgram(toEnvelopeProgram(program))` gives the same program, with two exceptions. A call with the input `null` comes back in a `$literal`. Data that the envelope form reads in a different way comes back in a `$literal` too. They give the same values, but a procedure that takes its input raw (section 9) sees the `$literal`.

## 12. Open questions and known differences

These points are not decided. Each point gives the behavior at the time of commit `5c16b25`.

The owner decided the root of a defined body in October 2026 (docs review DOC-3): a body operates as `client.exec()` operates (section 10). Before, a body hydrated the aggregation itself. Thus an array of calls in the input of its root call was a list of results. A root with `$when: "$never"` gave the call as data.

- **A context name on a chain step.** A step of `client.chain` with `$when: "$parent"` or a context name starts: the chain is the procedure that gets the step. Only a `$never` step is data.
- **Parallel hydration.** A program cannot set `parallel: true`. Only `client.parallel` starts refs at the same time.
- **The scope and a remote call.** A scope does not go over a transport. A control-flow procedure on a different host cannot read the names of the caller.
- **`$name` as a context.** A `$name` does not make a context for `$when`. Only a runner gives a context name (`"dag.traverse"`).

## 13. Programs on the kernel of coeval

Since revision 2, the kernel of coeval operates each program. The kernel holds the machinery that each language of documents needs. This machinery is the order of the parts, the names of a scope and the references. It is also the parts at the same time, the error values and the static check. The client keeps only what is its own: the program format and the procedures. The test is `program.test.ts`.

### The run document

`desugarProgram()` changes a program into a run document. `desugarInput()` changes the value of a hydration. The rules of sections 3 to 7 decide the shape of the document:

| `$proc` form | Run document |
|---|---|
| a call | `{ "type": path, "value": input }`. The world of a program is open: each path is a call. A path that starts with `lit`, `ref`, `program` or `procs` goes under `procs`. |
| a call without input | the value `null` |
| `$name` | the header `name`. A step with the name `last` gets the key `$last` |
| `{ "$ref": "a.b" }` in a scope | `{ "type": "ref", "value": ["names", "a", "b"] }` |
| `{ "$ref": "$last" }` | the name `last` |
| `{ "$literal": x }` | `{ "type": "lit", "value": x }` |
| an array of calls at a hydration root (section 7) | a call of `client.chain` |
| a value with calls in it, at a hydration root | a document of the kind `program.data` |
| an object with the shape of an envelope that holds a call | a document of the kind `program.record` |
| a call that waits for its runner, with calls or refs in its input (section 5) | a document of the kind `program.deferred` |
| a limit of section 3 or a cycle | a document of the kind `program.fail`. The error comes when the run reaches it, with the message of section 3. |
| other data | data. Data with the shape of an envelope becomes a literal. |

The kinds of the control-flow procedures tell the names that they bind. `client.chain` binds the `$name` of each step and `last` for the later steps. `client.map` binds `item` (or the name in `as`) and `index` for `fn`. `client.reduce` binds `acc`, `item` and `index` for `fn`. `client.tryCatch` binds `error` for `catch`.

### The run

- **One run.** `client.exec()` operates the program in one run of the kernel (`runProgram()`). The root call is the root document.
- **A call is an effect.** The runner of a call computes its input, and then it gives the call to the host as an effect. The host starts the call with `client.call()`. Thus `invokeProcedure()` stays the authority for each call: its admission, its validation, its interceptors, its capability and the expose rule of a server. The capabilities of the kernel permit each call. A direct call over HTTP or MCP does not go through the kernel, and it gets the same admission.
- **Raw input.** A procedure that takes its input raw (section 9) gets the input of the program, with the scope of the caller (`withScope()`).
- **Control flow.** The handler of a control-flow procedure gives its input to the kernel as a document of its kind (`runControl()`). The runner of the kind starts the operands. `client.parallel` starts its tasks with the parts at the same time of the kernel, with `concurrency` and `failFast`.
- **Errors.** A call that fails gives the error value `#CALC!` of the kernel, with the error of the call as its cause. The run throws the cause, so the caller gets the error of the call, with its message and its code. The messages of this document come from the runners.

### The static check

The static kit of coeval reads the same documents. `check()` finds a `$ref` whose name no kind around it binds, and a `$ref` that reads a later step. With `expand: true`, `desugarProgram()` also changes the operands of each control-flow call into documents, for a check. The compiler (`@procedures/compiler`) gives the issues as its diagnostics `unknown-name` and `use-before-definition`.

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
| A `$never` branch, try, task or `fn` started. A `fn` that was not one call was ignored. | A `$never` operand is data. A `fn` that is not one call is an error. | R4 (REV-4) |
| `procedure.list` and `procedure.get` gave only the defined procedures, or the whole registry when `client-procedure` was loaded. | One implementation for the whole registry, with `runtime: true` for the defined procedures. | DOC-6 |
| A defined body hydrated its root call as a nested call. A root `$when` applied, and an array of calls in the root input was a list of results. | A body operates as `client.exec()` operates the same program. | DOC-3 |
| With `failFast`, the other tasks of `client.parallel` went on after the first error. The same was true for the refs of `HydrateOptions.parallel`. | The error comes at once, and the other tasks stop at their next wait. A call that started goes on in its procedure. | M14 |
| A call that threw `undefined` failed the program with `undefined`. The error text of `client.parallel` and `client.tryCatch` was `"undefined"`. | The program fails with an `Error` that has the reason of the kernel. | M14 |
| `resolveScopes()` of the compiler gave the diagnostics in the order of the program tree. | It gives the warnings for the raw input first, and then the diagnostics of the names. | M14 |
