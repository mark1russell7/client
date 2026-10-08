# Procedure Aggregation Language

A comprehensive declarative/imperative programming system for composing, serializing, and executing procedures remotely.

## Overview

The procedure aggregation language enables:
- **Composable procedure pipelines** - Chain operations declaratively or imperatively
- **Full primitive operations** - Math, string, comparison, object, array operations
- **Bidirectional serialization** - Any aggregation ↔ JSON ↔ TypeScript
- **Remote execution** - client → server, CLI → anywhere
- **Type-safe composition** - Full TypeScript support with Zod validation

## Core Concepts

### Procedure Reference

Every procedure can be referenced by its path:

```typescript
import { proc, fromJson, toJson } from "@mark1russell7/client";

// Imperative (TypeScript)
const ref = proc(["client", "add"]).input({ a: 5, b: 3 });

// Declarative (JSON)
const json = {
  $proc: ["client", "add"],
  input: { a: 5, b: 3 }
};

// Bidirectional conversion
const jsonStr = toJson(ref);
const hydrated = fromJson(json);
```

### Procedure Path

Procedures are organized hierarchically by path:

| Prefix | Package | Description |
|--------|---------|-------------|
| `client.*` | @mark1russell7/client | Core operations (control flow, math, etc.) |
| `fs.*` | @mark1russell7/client-fs | Filesystem operations |
| `git.*` | @mark1russell7/client-git | Git operations |
| `lib.*` | @mark1russell7/client-cli | Library management |
| `config.*` | @mark1russell7/client-cli | Configuration management |
| `procedure.*` | @mark1russell7/client-cli | Procedure scaffolding |

---

## Core Procedures (`client.*`)

### Control Flow

#### `client.chain`
Execute procedures sequentially, passing output to next input.

```typescript
await client.call(["client", "chain"], {
  steps: [
    proc(["client", "constant"]).input({ value: 5 }),
    proc(["client", "add"]).input({ a: "$prev", b: 10 }),
    proc(["client", "multiply"]).input({ a: "$prev", b: 2 })
  ]
});
// Result: 30
```

#### `client.parallel`
Execute procedures concurrently.

```typescript
await client.call(["client", "parallel"], {
  procedures: [
    proc(["fs", "read"]).input({ path: "a.txt" }),
    proc(["fs", "read"]).input({ path: "b.txt" }),
  ]
});
// Result: [{ content: "..." }, { content: "..." }]
```

#### `client.conditional`
If/then/else branching.

```typescript
await client.call(["client", "conditional"], {
  condition: proc(["client", "gt"]).input({ a: "$input.value", b: 100 }),
  then: proc(["client", "multiply"]).input({ a: "$input.value", b: 0.9 }),
  else: proc(["client", "identity"]).input({ value: "$input.value" })
});
```

#### `client.tryCatch`
Error handling with fallback.

```typescript
await client.call(["client", "tryCatch"], {
  try: proc(["fs", "read"]).input({ path: "config.json" }),
  catch: proc(["client", "constant"]).input({ value: {} })
});
```

### Logic Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.and` | `{ values: boolean[] }` | `boolean` | Logical AND |
| `client.or` | `{ values: boolean[] }` | `boolean` | Logical OR |
| `client.not` | `{ value: boolean }` | `boolean` | Logical NOT |

### Math Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.add` | `{ a: number, b: number }` | `number` | Addition |
| `client.subtract` | `{ a: number, b: number }` | `number` | Subtraction |
| `client.multiply` | `{ a: number, b: number }` | `number` | Multiplication |
| `client.divide` | `{ a: number, b: number }` | `number` | Division |
| `client.mod` | `{ a: number, b: number }` | `number` | Modulo |
| `client.abs` | `{ value: number }` | `number` | Absolute value |
| `client.min` | `{ values: number[] }` | `number` | Minimum |
| `client.max` | `{ values: number[] }` | `number` | Maximum |
| `client.sum` | `{ values: number[] }` | `number` | Sum of array |
| `client.pow` | `{ base: number, exp: number }` | `number` | Power |
| `client.sqrt` | `{ value: number }` | `number` | Square root |
| `client.floor` | `{ value: number }` | `number` | Floor |
| `client.ceil` | `{ value: number }` | `number` | Ceiling |
| `client.round` | `{ value: number, decimals?: number }` | `number` | Round |

### Comparison Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.eq` | `{ a: unknown, b: unknown }` | `boolean` | Strict equality |
| `client.neq` | `{ a: unknown, b: unknown }` | `boolean` | Not equal |
| `client.gt` | `{ a: number, b: number }` | `boolean` | Greater than |
| `client.gte` | `{ a: number, b: number }` | `boolean` | Greater or equal |
| `client.lt` | `{ a: number, b: number }` | `boolean` | Less than |
| `client.lte` | `{ a: number, b: number }` | `boolean` | Less or equal |
| `client.between` | `{ value: number, min: number, max: number }` | `boolean` | Range check |

### String Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.concat` | `{ values: string[] }` | `string` | Concatenate |
| `client.split` | `{ value: string, separator: string }` | `string[]` | Split |
| `client.join` | `{ values: string[], separator: string }` | `string` | Join |
| `client.replace` | `{ value: string, search: string, replace: string }` | `string` | Replace |
| `client.substring` | `{ value: string, start: number, end?: number }` | `string` | Substring |
| `client.trim` | `{ value: string }` | `string` | Trim whitespace |
| `client.toLower` | `{ value: string }` | `string` | Lowercase |
| `client.toUpper` | `{ value: string }` | `string` | Uppercase |
| `client.startsWith` | `{ value: string, search: string }` | `boolean` | Starts with |
| `client.endsWith` | `{ value: string, search: string }` | `boolean` | Ends with |
| `client.includes` | `{ value: string, search: string }` | `boolean` | Contains |
| `client.strLength` | `{ value: string }` | `number` | String length |
| `client.template` | `{ template: string, values: Record<string, unknown> }` | `string` | Interpolation |

### Type Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.typeof` | `{ value: unknown }` | `string` | Type name |
| `client.isNull` | `{ value: unknown }` | `boolean` | Is null |
| `client.isUndefined` | `{ value: unknown }` | `boolean` | Is undefined |
| `client.isArray` | `{ value: unknown }` | `boolean` | Is array |
| `client.isObject` | `{ value: unknown }` | `boolean` | Is object |
| `client.isString` | `{ value: unknown }` | `boolean` | Is string |
| `client.isNumber` | `{ value: unknown }` | `boolean` | Is number |
| `client.isBoolean` | `{ value: unknown }` | `boolean` | Is boolean |
| `client.coerce` | `{ value: unknown, to: "string" \| "number" \| "boolean" }` | `unknown` | Type coercion |

### Object Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.get` | `{ object: object, path: string }` | `unknown` | Get nested property |
| `client.set` | `{ object: object, path: string, value: unknown }` | `object` | Set nested property |
| `client.merge` | `{ objects: object[] }` | `object` | Deep merge |
| `client.keys` | `{ object: object }` | `string[]` | Object keys |
| `client.values` | `{ object: object }` | `unknown[]` | Object values |
| `client.entries` | `{ object: object }` | `[string, unknown][]` | Key-value pairs |
| `client.pick` | `{ object: object, keys: string[] }` | `object` | Pick properties |
| `client.omit` | `{ object: object, keys: string[] }` | `object` | Omit properties |
| `client.has` | `{ object: object, path: string }` | `boolean` | Has property |

### Array Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.map` | `{ items: unknown[], procedure: ProcedureRef }` | `unknown[]` | Map |
| `client.reduce` | `{ items: unknown[], procedure: ProcedureRef, initial: unknown }` | `unknown` | Reduce |
| `client.filter` | `{ items: unknown[], predicate: ProcedureRef }` | `unknown[]` | Filter |
| `client.find` | `{ items: unknown[], predicate: ProcedureRef }` | `unknown` | Find first |
| `client.findIndex` | `{ items: unknown[], predicate: ProcedureRef }` | `number` | Find index |
| `client.some` | `{ items: unknown[], predicate: ProcedureRef }` | `boolean` | Any match |
| `client.every` | `{ items: unknown[], predicate: ProcedureRef }` | `boolean` | All match |
| `client.first` | `{ items: unknown[] }` | `unknown` | First item |
| `client.last` | `{ items: unknown[] }` | `unknown` | Last item |
| `client.nth` | `{ items: unknown[], index: number }` | `unknown` | Item at index |
| `client.arrLength` | `{ items: unknown[] }` | `number` | Array length |
| `client.flatten` | `{ items: unknown[][], depth?: number }` | `unknown[]` | Flatten |
| `client.reverse` | `{ items: unknown[] }` | `unknown[]` | Reverse |
| `client.sort` | `{ items: unknown[], key?: string, desc?: boolean }` | `unknown[]` | Sort |
| `client.slice` | `{ items: unknown[], start: number, end?: number }` | `unknown[]` | Slice |
| `client.arrConcat` | `{ arrays: unknown[][] }` | `unknown[]` | Concatenate |
| `client.unique` | `{ items: unknown[] }` | `unknown[]` | Unique values |
| `client.groupBy` | `{ items: unknown[], key: string }` | `Record<string, unknown[]>` | Group by |

### Meta Operations

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `client.import` | `{ json?: string, path?: string }` | `ProcedureRef` | Load from JSON |
| `client.export` | `{ procedure: ProcedureRef }` | `string` | Export to JSON |
| `client.eval` | `{ procedure: ProcedureRef, input?: unknown }` | `unknown` | Execute ref |
| `client.parseJson` | `{ json: string }` | `unknown` | Parse JSON |
| `client.stringifyJson` | `{ value: unknown }` | `string` | Stringify |
| `client.identity` | `{ value: unknown }` | `unknown` | Pass through |
| `client.constant` | `{ value: unknown }` | `unknown` | Return constant |
| `client.throw` | `{ message: string }` | `never` | Throw error |

---

## Filesystem Procedures (`fs.*`)

Install: `@mark1russell7/client-fs`

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `fs.read` | `{ path: string, encoding?: string }` | `{ content, path, size }` | Read file |
| `fs.write` | `{ path: string, content: string, mode?: "write" \| "append" }` | `{ path, bytesWritten }` | Write file |
| `fs.exists` | `{ path: string }` | `{ exists, path, type? }` | Check existence |
| `fs.mkdir` | `{ path: string, recursive?: boolean }` | `{ path, created }` | Create directory |
| `fs.rm` | `{ path: string, recursive?: boolean, force?: boolean }` | `{ path, removed }` | Remove |
| `fs.readdir` | `{ path: string, recursive?: boolean, includeStats?: boolean }` | `{ path, entries }` | List directory |
| `fs.stat` | `{ path: string }` | `{ path, type, size, mtime, ... }` | File stats |
| `fs.copy` | `{ src: string, dest: string, ... }` | `{ src, dest }` | Copy |
| `fs.move` | `{ src: string, dest: string, ... }` | `{ src, dest }` | Move/rename |
| `fs.glob` | `{ pattern: string, cwd?: string, ... }` | `{ pattern, matches }` | Glob match |
| `fs.read.json` | `{ path: string }` | `{ path, data }` | Read JSON |

---

## Git Procedures (`git.*`)

Install: `@mark1russell7/client-git`

| Procedure | Input | Output | Description |
|-----------|-------|--------|-------------|
| `git.status` | `{ cwd?: string, short?: boolean }` | `{ branch, ahead, behind, files, clean }` | Status |
| `git.add` | `{ paths?: string[], all?: boolean, cwd?: string }` | `{ staged }` | Stage files |
| `git.commit` | `{ message: string, all?: boolean, amend?: boolean }` | `{ hash, message, author, date }` | Commit |
| `git.push` | `{ remote?, branch?, force?, setUpstream? }` | `{ remote, branch, commits }` | Push |
| `git.pull` | `{ remote?, branch?, rebase? }` | `{ remote, branch, commits, fastForward }` | Pull |
| `git.clone` | `{ url: string, dest?, branch?, depth? }` | `{ path, branch }` | Clone |
| `git.checkout` | `{ ref: string, create?, paths? }` | `{ ref, created }` | Checkout |
| `git.branch` | `{ name?, delete?, list?, remote? }` | `{ branches?, created?, deleted?, current }` | Branches |
| `git.log` | `{ count?, oneline?, ref? }` | `{ commits }` | Log |
| `git.diff` | `{ staged?, ref?, paths?, stat? }` | `{ files, additions, deletions, diff? }` | Diff |

---

## Creating Custom Procedures

### Using the CLI

```bash
# Scaffold a new procedure
mark procedure new myns.operation -d "My custom operation"
```

This creates:
- `src/procedures/myns/operation.ts` - Procedure handler
- Updates `src/types.ts` - Input/output types
- Updates `src/procedures/myns/index.ts` - Barrel export

### Manual Definition

```typescript
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { z } from "zod";

// Define input schema
const MyInputSchema = z.object({
  value: z.string(),
  count: z.number().default(1),
});

type MyInput = z.infer<typeof MyInputSchema>;

interface MyOutput {
  result: string;
}

// Create procedure
const myProcedure = createProcedure()
  .path(["myns", "operation"])
  .input(zodAdapter<MyInput>(MyInputSchema))
  .output(outputSchema<MyOutput>())
  .meta({
    description: "My custom operation",
    args: ["value"],
    shorts: { count: "n" },
    output: "json",
  })
  .handler(async (input: MyInput): Promise<MyOutput> => {
    return { result: input.value.repeat(input.count) };
  })
  .build();

// Register
registerProcedures([myProcedure]);
```

### Package Registration

Add to `package.json`:

```json
{
  "client": {
    "procedures": "./dist/register.js"
  }
}
```

Procedures auto-register when the package is imported.

---

## JSON Serialization Format

All procedures can be serialized to JSON using the `$proc` key:

```json
{
  "$proc": ["client", "chain"],
  "input": {
    "steps": [
      {
        "$proc": ["fs", "read"],
        "input": { "path": "config.json" }
      },
      {
        "$proc": ["client", "parseJson"],
        "input": { "json": "$prev.content" }
      },
      {
        "$proc": ["client", "get"],
        "input": { "object": "$prev", "path": "settings.theme" }
      }
    ]
  }
}
```

### Special Variables

- `$input` - The input to the current procedure
- `$prev` - The output of the previous step (in chains)
- `$item` - Current item (in map/filter/reduce)
- `$index` - Current index (in map/filter)
- `$acc` - Accumulator (in reduce)

---

## Remote Execution

Procedures can execute remotely via the client transport:

```typescript
import { createClient } from "@mark1russell7/client";

// Client connects to remote server
const client = createClient({
  transport: "http",
  endpoint: "https://api.example.com/rpc"
});

// Call executes on server
await client.call(["fs", "read"], { path: "/data/file.txt" });
```

---

## Best Practices

1. **Use chains for sequential operations** - More readable than nested procedure refs
2. **Prefer parallel for independent operations** - Better performance
3. **Handle errors with tryCatch** - Graceful degradation
4. **Type your inputs with Zod** - Runtime validation
5. **Keep procedures focused** - Single responsibility
6. **Use the CLI for scaffolding** - Consistent structure
