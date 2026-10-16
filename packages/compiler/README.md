# @procedures/compiler

[![npm](https://img.shields.io/npm/v/@procedures/compiler?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/compiler)

```sh
npm install @procedures/compiler
```

The compiler of procedure programs. A program is a procedure as data: a JSON tree of calls, names and references ([PROGRAM-FORMAT.md](../documentation/PROGRAM-FORMAT.md)).

- `checkProgram()` examines the whole program before the first procedure starts. It finds each problem and the effects of the program.
- `compileProgram()` writes the checked program as a plain `async (ctx, input) => output` function.
- The procedures `program.check` and `program.compile` give the same functions to the clients of a host.

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

## The procedures

```typescript
import "@procedures/compiler/register";

const checked = await client.exec(["program", "check"], { program, capability: { effects: { writes: [] } } });
const compiled = await client.exec(["program", "compile"], { program, language: "ts" });
```

- The two procedures take the program as data (the `raw-input` tag): nothing of it starts.
- They read the registry and the expose rule of the host, and change nothing.
- Without a `capability` in the input, they use the capability of the caller.
- `program.compile` gives the source text, not the closure code.
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

## Tests

A property test makes hundreds of random programs. It starts each program three times: with the interpreter, with the closure code and with the source text. The three runs must give the same result or error. They must start the same procedures in the same order. A second property examines that each run has only the inferred effects.
