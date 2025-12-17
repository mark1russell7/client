# @mark1russell7/cli

Main CLI entry point for the mark ecosystem. A generic CLI that dynamically reflects registered procedures.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                mark CLI                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   $ mark lib refresh -a                                                      │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Argument Parser                              │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │   │
│   │   │    path     │  │    args     │  │         options             │ │   │
│   │   │ ["lib",     │  │     []      │  │  { all: true }              │ │   │
│   │   │  "refresh"] │  │             │  │                             │ │   │
│   │   └─────────────┘  └─────────────┘  └─────────────────────────────┘ │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     Procedure Lookup                                 │   │
│   │                                                                      │   │
│   │   PROCEDURE_REGISTRY.getAll()  →  findProcedure(procs, ["lib",      │   │
│   │                                                          "refresh"]) │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       Schema Parsing                                 │   │
│   │                                                                      │   │
│   │   parseFromSchema(parameters, meta)  →  { all: true, path: "..." }  │   │
│   │                                                                      │   │
│   │   Uses procedure metadata for:                                       │   │
│   │   • args: ["path"]  →  positional arguments                         │   │
│   │   • shorts: { all: "a", dryRun: "d" }  →  flag expansion            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Client Execution                                │   │
│   │                                                                      │   │
│   │   const client = new Client({ transport: LocalTransport })          │   │
│   │   const result = await client.call(method, validated)               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Output Formatting                               │   │
│   │                                                                      │   │
│   │   meta.output: "text" | "json" | "table" | "streaming"              │   │
│   │                                                                      │   │
│   │   formatOutput(print, result, outputFormat)                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Procedure Packages                                    │
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │   client-cli    │  │  client-logger  │  │  client-mongo   │            │
│   │   ┌───────────┐ │  │   ┌─────────┐   │  │   ┌─────────┐   │            │
│   │   │ lib.*     │ │  │   │ log.*   │   │  │   │ mongo.* │   │            │
│   │   │ config.*  │ │  │   └─────────┘   │  │   └─────────┘   │            │
│   │   └───────────┘ │  │                 │  │                 │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install -g github:mark1russell7/cli#main
```

## Usage

```bash
# Show all commands
mark --help

# Show group help
mark lib --help

# Run a command
mark lib scan
mark lib refresh -a
mark lib new my-package -p lib
mark config generate

# Options
mark lib refresh --all --dryRun
mark lib refresh -a -d              # Short form
```

## How It Works

1. **Dynamic Import**: The CLI dynamically imports procedure packages
2. **Registry Sync**: Procedures register via `PROCEDURE_REGISTRY`
3. **LocalTransport**: Uses in-process transport for execution
4. **Metadata-Driven**: Commands derive help and parsing from procedure metadata

## Procedure Discovery

Procedure packages auto-register when imported:

```typescript
// cli.ts
await import("@mark1russell7/client-cli");  // Registers lib.*, config.*
await import("@mark1russell7/client-logger"); // Registers log.*
```

Each package uses `postinstall: client announce` to register with the ecosystem.

## Metadata Format

Procedures declare CLI behavior via metadata:

```typescript
.meta({
  description: "Refresh a library",
  args: ["path"],           // Positional arguments
  shorts: {                 // Short flag mappings
    recursive: "r",
    all: "a",
    force: "f",
    dryRun: "d",
  },
  output: "streaming",      // Output format
})
```

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Plain text output |
| `json` | JSON-formatted output |
| `table` | Tabular output |
| `streaming` | Progress spinner with final result |

## Package Ecosystem

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     cli      │────►│   client     │────►│  client-cli  │
│   (entry)    │     │  (RPC core)  │     │ (procedures) │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              ┌────────────┐ ┌────────────┐
              │  client-   │ │  client-   │
              │  logger    │ │  mongo     │
              └────────────┘ └────────────┘
```

## License

MIT
