# @procedures/compiler

[![npm](https://img.shields.io/npm/v/@procedures/compiler?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/compiler)

```sh
npm install @procedures/compiler
```

The compiler of procedure programs. A program is a procedure as data: a JSON tree of calls, names and references ([PROGRAM-FORMAT.md](../documentation/PROGRAM-FORMAT.md)).

- `checkProgram()` examines the whole program before the first procedure starts. It finds each problem and the effects of the program.
- `compileProgram()` writes the checked program as a plain `async (ctx, input) => output` function.
- `diagramProgram()` draws the program as a Mermaid flowchart.
- `explainProgram()` tells the effects of the program and the answer of the capability for each call.
- `toOpenRpc()` and `toTypeScriptSdk()` write an OpenRPC document and a typed TypeScript SDK from a manifest.
- The procedures `program.check`, `program.compile`, `program.diagram`, `program.explain`, `sdk.openrpc` and `sdk.typescript` give the same functions to the clients of a host.

The package works in a browser. It reads the facts of the procedures from a manifest (`procedure.manifest`) or from a registry.

## Why a check before the run

The interpreter of `@procedures/client` finds a problem only when it arrives at the problem. Example: step 1 writes a file, step 2 writes a commit, and step 3 calls a procedure that the capability refuses. The refusal comes after two writes.

`checkProgram()` finds the refusal of step 3 before step 1 starts. When the result has an error, the host does not start the program.

## What the check finds

| Code | Severity | The problem |
|---|---|---|
| `unknown-name` | error | A `$ref` reads a name that no scope has. |
| `use-before-definition` | error | A `$ref` reads the `$name` of a later step of the chain. |
| `unknown-procedure` | error | No procedure has the path, or the host does not expose it in its manifest. |
| `not-exposed` | error | The registry has the procedure, but the expose rule of the host refuses it. |
| `capability-refused` | error | The capability refuses the call: its effects, or a destructive procedure. |
| `effects-unknown` | error with a capability that limits effects, else info | The compiler cannot see what a call runs (`dag.traverse`, a defined body that the manifest does not show). The check fails closed. |
| `input-schema` | error | A literal part of an input does not agree with the JSON Schema of the procedure. |
| `invalid-control-flow` | error | The input of `client.chain`, `client.map` or another control-flow procedure does not agree with its schema. |
| `fn-not-call` | error | The `fn` of `client.map` or `client.reduce` is not one call. |
| `depth-limit`, `data-depth`, `cyclic-input` | error | The input goes past a limit of the hydration. |
| `invalid-path`, `root-not-call` | error | A `$proc` path is not valid, or the program is not a call. |
| `never-trap` | warning | A `$never` call is data in a place where a call usually starts: a chain step, a condition, a `fn`, a list that is not a chain. |
| `unscoped-ref` | warning | A `$ref` is outside each scope, so it is data. |
| `name-not-bound`, `duplicate-name` | warning | A `$name` that no `$ref` can read, or two steps with one name. |
| `input-replaced` | warning | Control flow adds `cwd` to an input that is not an object, so the input is lost. |
| `implicit-chain`, `deferred-call` | info | An array of calls operates as one chain, or a call waits for its runner. |

Each diagnostic has a JSON pointer (RFC 6901) to its part of the program.

The static kit of the kernel [coeval](https://github.com/mark1russell7/coeval) finds the problems of the names (`unknown-name`, `use-before-definition`). The client changes the program into a run document (`desugarProgram()`), and `check()` of `@mark1russell7/coeval` examines it. The kinds of the control-flow procedures tell the names that they bind. Thus the check and the run of a program read the names with the same rules. `nameDiagnostics()` gives these diagnostics alone.

## Effects

The check gives the effects of the whole program, from the bottom up:

- `effects` is the upper bound. It has the reads and the writes of each call that can start. A call that does not declare its effects makes the list unknown: the list is absent.
- `mustEffects` is the lower bound: the effects of each run in which no call fails. Two branches give the intersection of their effects. A later operand of `client.and` gives nothing.

`effects` has the form of the `effects` of a manifest entry, so a host can give it to `capabilityRefusal()`.

## Use the check

```typescript
import { checkProgram } from "@procedures/compiler";

// A host: the registry gives the procedures and the bodies of the defined procedures
const result = checkProgram(program, {
  registry,
  expose: policy.expose,
  capability: { effects: { writes: [] } },
});
if (!result.ok) {
  for (const diagnostic of result.diagnostics) console.log(diagnostic.pointer, diagnostic.message);
}

// A browser: only the manifest of the host
const manifest = await client.exec(["procedure", "manifest"], {});
const checked = checkProgram(program, { manifest });
```

Give `mode: "body"` for the body of a procedure that `procedure.define` makes. Then the scope has the name `input`.

## Check each program of a host

`programCheckInterceptor()` checks the program of each call to a data-driven procedure before the procedure starts. When the check finds an error, the host refuses the call, and no step starts. The MCP server of `@procedures/mcp-dev-tools` uses it.

```typescript
import { programCheckInterceptor } from "@procedures/compiler";

const server = new ProcedureServer({
  registry,
  expose,
  interceptors: [programCheckInterceptor({ registry, expose })],
});
```

- The error has the code of the interpreter for the same problem: `NOT_EXPOSED`, `NOT_FOUND`, `FORBIDDEN` with its reason, or `VALIDATION_ERROR`.
- The check is conservative. It refuses a call in a branch that does not run, and a refused call inside `client.tryCatch`.
- The interceptor keeps the facts of the registry until the registry changes.
- `refuses` selects the diagnostics that refuse a program. The default refuses each error.

## Use the compiler

```typescript
import { compileProgram } from "@procedures/compiler";

const compiled = await compileProgram(program, { registry, language: "ts" });

// The closure code: a host runs it in a procedure handler. It uses no eval.
const output = await compiled.run(ctx, input);

// The source text: an ES module whose default export is the function
await writeFile("program.ts", compiled.code);
```

The compiled function makes each call through `ctx.client.call`, in the order of the interpreter. Each call keeps its validation, admission, deadline and interceptors. The function does the work of the control-flow procedures in line: it does not start `client.chain` or `client.map`.

A call whose procedure takes its input raw (`client.eval`, `dag.traverse`, `procedure.define`) is a dynamic node. The function gives such a procedure the raw input and the scope, and the interpreter of the client operates it.

`client.exec(program, input)` puts the fields of `input` over the input of the root call. That changes the program, so the compiled function gives such an input to the interpreter.

`fold: true` computes the pure core procedures with literal inputs at compile time. Only a core procedure of `@procedures/client` with `reads: []` and `writes: []` folds. A folded call does not start, so an interceptor does not see it.

The result has `code` (the module), `body` (the function body for a host that evaluates code), `sourceMap` (the lines of the code and their pointers), `registryHash` (the hash of the manifest) and the result of the check. Give `registryHash` to the host with the code: a different hash means different procedures.

## Draw a program

```typescript
import { diagramProgram } from "@procedures/compiler";

const { mermaid, diagnostics } = diagramProgram(program, { registry });
```

The flowchart comes from the IR, so it shows the order of the interpreter. A solid arrow is the order of the steps. A dotted arrow carries data.

| Part of the program | Part of the flowchart |
|---|---|
| A call | A box with the key of the procedure. A call in an input comes before its call. |
| `client.chain` | A subgraph with the steps in order |
| `client.parallel` | A fork node, an arrow to each task, and a join node |
| `client.conditional` | The condition, then a decision node with a `then` arrow and an `else` arrow |
| `client.tryCatch` | A `try` subgraph, and an `error` arrow from the subgraph to the catch part |
| `client.map`, `client.reduce` | A loop node: an `each item` arrow to `fn`, an arrow back, and a `done` arrow |
| `client.and`, `client.or` | The operands in order, and a stop arrow from each operand to the join node |
| `$ref` | A dotted arrow from the part that binds the name to the part that reads it |
| A dynamic call | A box with double sides and the reason. A `runs` subgraph shows its program, when the compiler can see it. |
| A deferred call, a `$never` call | A box with a dashed border: the call is data |

- A node with an error of the check has the class `error`. A `$ref` to an unknown name gets its own node.
- `mermaidText()` keeps letters, digits, spaces and some punctuation. It writes each other character as an entity code, for example `#34;` for a quote.
- Thus no text of a program can break the syntax of the flowchart. Quotes, brackets, `<`, line breaks and Unicode line separators are safe.
- `toMermaid(ir)` draws an IR that you have already. The golden flowcharts are in `test/golden/*.mmd`.

## Explain a program

```typescript
import { explainProgram } from "@procedures/compiler";

const explanation = explainProgram(program, { registry, capability: { effects: { writes: [] } } });
console.log(explanation.summary);
// The program has 5 calls of 4 procedures. The program can read store and can change store. ...
```

`explainProgram()` uses `checkProgram()` and `explainInvocation()` of `@procedures/client`. The result has these parts:

- `effects` and `mustEffects`: the effects of the check.
- `calls`: each call in the order of the tree, with its key, path, pointer and kind (`call`, `control` or `dynamic`).
- For each call: the declared `effects`, `known`, `exposed`, and `permitted`, `reason` and `message` under the capability.
- `diagnostics`: the problems of the check.
- `summary`: the same information in short sentences. An application can show it to a user before the program starts.

## OpenRPC and a typed SDK

```typescript
import { toOpenRpc, toTypeScriptSdk } from "@procedures/compiler";

const manifest = await client.exec(["procedure", "manifest"], {});
const document = toOpenRpc(manifest);
const source = toTypeScriptSdk(manifest);
```

`toOpenRpc()` gives an OpenRPC 1.3 document with one method for each procedure:

- The name of the method is the key of the procedure. `x-path` is the path.
- The one parameter `input` has the input schema. The result `output` has the output schema.
- `x-effects` has the declared effects. `x-data-driven` marks a procedure that operates its input as a program.
- The keys have a fixed order, and the methods are in the order of their names. Thus one manifest always gives the same text.

`toTypeScriptSdk()` gives the source of a TypeScript module without imports:

- An input type and an output type for each procedure, from the JSON Schemas.
- The interface `Sdk`, with a method for each procedure at `sdk.<namespace>.<name>`.
- The function `createSdk(client)`. Each method sends its path and its input to `client.call(path, input)`.

```typescript
import { createSdk } from "./sdk.js";

// In a procedure handler: ctx.client calls the procedures of the host
const sdk = createSdk(ctx.client);
const value = await sdk.client.identity({ value: 1 });

// With a Client
const remote = createSdk({ call: (path, input) => client.exec(path, input) });
```

The converter of the schemas knows a part of JSON Schema:

- An object with its `required` list. A property name that is not an identifier gets quotes.
- An array, a string, a number, an integer, a boolean and `null`.
- `enum`, `const`, `anyOf` and `oneOf` as unions.
- `additionalProperties` as an index signature.
- Each other schema gives `unknown`.

A test writes the SDK of the core procedures to a temporary folder. It type-checks the SDK with the TypeScript and the strict options of this package.

## The procedures of a package from its types

The generator reads the declaration files of a package. It gives a procedure for each public function whose inputs and output are JSON. Nobody writes the wrapper, so the wrapper cannot drift from its package.

```typescript
import { generateExportsManifest } from "@procedures/compiler/generate";
import { exportsModule } from "@procedures/compiler";
import * as statistics from "@mark1russell7/rigor-statistics";

// At build time, in Node: the manifest is data
const manifest = generateExportsManifest({
  declarations: "node_modules/@mark1russell7/rigor-statistics/build/index.d.ts",
  package: "@mark1russell7/rigor-statistics",
  namespace: ["statistics"],
  overlay: { effects: { reads: [], writes: [] } },
});

// At run time, also in a browser: the procedures
const registry = createRegistry(exportsModule(manifest, statistics));
await client.exec(["statistics", "median"], { values: [3, 1, 2, 10] }); // 2.5
```

- The input is an object with one property for each parameter. The handler gives the properties to the function in the order of the parameters. A rest parameter is an array.
- The schemas come from the types. A named interface or type alias goes into `$defs` one time, so a recursive type is a reference to itself. A named union also goes into `$defs`. Its definition has no `undefined` member, as an input of a union with no name. For an output with an `undefined` member, the schema is the definition or `null`.
- A schema has at most 64 levels. A deeper type, for example a type that grows at each level, fails closed: its function gets an exemption.
- The description comes from the first paragraph of the doc comment. The description of a parameter or a property comes from its own doc comment.
- An output of `undefined` or `void` is `null`, as in JSON. For a function that gives a promise, the output is the value of the promise.
- A call in process gives the output that a call over HTTP gives. An `undefined` item of an array becomes `null`, and a property with an `undefined` value is absent.
- A type parameter is any JSON value, or the schema of its constraint.
- The overlay is the data that the types cannot tell. It has the effects of the package and of single functions. It also names the functions with no procedure, each with its reason.
- The field `constructors` of the overlay names the factory of a type, when more than one function gives the type.

Each other function gets an exemption with its reason and the part of the signature that decided:

| Reason | The cause | The plan |
|---|---|---|
| `function-parameter` | A sub-program cannot give the function: it has more than one signature, a type parameter, a rest parameter, a promise, no value or a type that is not JSON. | No change. |
| `input-not-json` | An input is not JSON: a `Map`, a `Date`, a `bigint`, an object with methods that no pure factory makes, or a type that does not resolve. | An object with methods becomes a handle. |
| `output-not-json` | The output is not JSON, for example a class instance. | The handle of the instance. |
| `overload` | The function has more than one signature. | One procedure for each signature. |
| `overlay` | The overlay exempts the function. | No change. |
| `unresolved` | A re-export does not resolve, for example because its module is not installed. | Install the module. |

A type that does not resolve fails closed: it gives an exemption, not a schema that accepts each value. The generator reads the real path of the declaration file, as Node.js does, so a link of pnpm resolves the imports of the package. TypeScript 7 has no compiler API in JavaScript, so the entry `./generate` reads the API of TypeScript 5. Add `"typescript-api": "npm:typescript@^5.9.3"` to the `devDependencies` of the package that starts the generator.


### A function parameter is a sub-program

A function parameter, for example the statistic of a bootstrap, gets a sub-program. A sub-program is one call of a pure procedure, as data. It reads each parameter of the function as `{ "$ref": "<name>" }`:

```json
{
  "$proc": ["statistics", "bootstrap"],
  "input": {
    "data": [3, 1, 4, 1, 5],
    "statistic": { "$proc": ["statistics", "mean"], "input": { "values": { "$ref": "sample" } }, "$when": "$never" },
    "options": { "runs": 200, "seed": 7 }
  }
}
```

- In a program, `"$when": "$never"` keeps the call as data. A tool input of MCP or a direct call can omit `$when`.
- The schema of the position has the keyword `x-procedures-program`. It gives the names and the schemas of the parameters, and the schema of the result.
- The loader compiles the call into a function. The function gives its value at once, as the package needs it.
- A sub-program uses only operators. An operator is a pure procedure of an exports manifest. It gives no promise and takes no sub-program.
- The loader finds each operator in the registry of the caller, before the function of the package starts. It obeys the `expose` rule of the caller.
- The loader examines the input of each operator and the result of the function with their schemas.
- An array of calls is a chain, so a sub-program refuses it. Only the root call has a `$when`.
- A function that a sub-program cannot give stays exempt with the reason `function-parameter`. A function in an output gives the reason `output-not-json`.
- A sub-program gives JSON. So a function whose result is a function stays exempt with the reason `function-parameter`.

Thus a sub-program changes nothing, and it gives the same value for the same input.

### A constructed input

A parameter that is not JSON, for example a `Random` with methods, gets a constructed input. A pure function of the package, the factory, makes the value from JSON:

```json
{ "$proc": ["generators", "latinHypercube"], "input": { "n": 5, "d": 3, "r": { "seed": 7 } } }
```

- The input value is the input of the factory: one property for each parameter. Here the factory is `random(seed)`.
- The schema of the parameter has the keyword `x-procedures-construct`. It gives the name of the factory and the names of its parameters.
- A factory is an export with one signature and no type parameter. Its effects are pure, and it gives an object, not a promise.
- The input of a factory stops at its first optional parameter that is not JSON. A parameter that is not JSON and not optional refuses the factory.
- When more than one factory gives the type, the field `constructors` of the overlay names one. Without it, the function stays exempt, and the detail names the factories.
- Only a parameter of the function gets a constructed input, not a property of a parameter.
- Before each call, the loader makes a new value with the factory. Thus a call does not change the next call.

## The procedures

```typescript
import "@procedures/compiler/register";

const checked = await client.exec(["program", "check"], { program, capability: { effects: { writes: [] } } });
const compiled = await client.exec(["program", "compile"], { program, language: "ts" });
const drawn = await client.exec(["program", "diagram"], { program, direction: "LR" });
const explained = await client.exec(["program", "explain"], { program });
const document = await client.exec(["sdk", "openrpc"], { namespace: "client" });
const sdk = await client.exec(["sdk", "typescript"], {});
```

- The four `program.*` procedures take the program as data (the `raw-input` tag): nothing of it starts.
- `program.check`, `program.compile` and `program.explain` take a `capability` in the input. Without it, they use the capability of the caller, as `program.diagram` does.
- `program.compile` gives the source text, not the closure code.
- `sdk.openrpc` and `sdk.typescript` describe the registry of the caller, as `procedure.manifest` does. The input `namespace` selects one namespace.
- The six procedures read the registry and obey the expose rule of the host. They change nothing.
- The MCP server of `@procedures/mcp-dev-tools` gives the `program.*` procedures as tools. The namespace `sdk` is not a tool namespace.
- `createRegistry(compilerModule)` gives them without the global registry.

## The intermediate representation

The normalize pass makes the IR. Each node has the pointer of its source.

| Node | Source |
|---|---|
| `literal` | Data, a `$literal`, a `$never` call, a `$ref` outside each scope |
| `object`, `array` | Plain data with calls or references in it |
| `reference` | A `$ref` in a scope, with the binding that the scopes pass finds |
| `call` | A call that starts, with its hydrated input |
| `deferred` | A call that waits for its runner (`$parent` or a context name) |
| `chain`, `parallel`, `conditional`, `try`, `and`, `or`, `map`, `reduce` | The core control-flow procedures, explicit or implicit |
| `dynamic` | A call of a procedure that takes its input raw, and a control-flow call with an input that is not valid |
| `fail` | A step of the interpreter that throws: a hydration limit, a `fn` that is not a call |

`printIR()` gives the IR as text. The passes are also exports: `normalize()`, `resolveScopes()`, `inferEffects()`, `checkCalls()`, `foldProgram()`, `compileClosure()` and `emitText()`.

The order of the diagnostics of `resolveScopes()` (D26): first the warnings for the raw input, and then the diagnostics of the names. Before 0.26.0, the diagnostics came in the order of the program tree. Sort the diagnostics by `pointer` when the order matters.

## Tests

A property test makes hundreds of random programs. It starts each program three times: with the interpreter, with the closure code and with the source text. The three runs must give the same result or error. They must start the same procedures in the same order. A second property examines that each run has only the inferred effects.

A third property draws the flowchart of each random program and examines the grammar of each line. The golden files in `test/golden` hold the IR, the source text, the flowcharts, an OpenRPC document and an SDK. To accept an intended change, start `npx vitest run -u` in this package and examine the diff.
