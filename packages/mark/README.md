# @mark1russell7/cli

Dynamic CLI that discovers and executes registered procedures from the ecosystem.

## Installation

```bash
npm install github:mark1russell7/cli#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INPUT                                      │
│                                                                              │
│   $ mark lib new my-package                                                  │
│   $ mark git status --short                                                  │
│   $ mark fs read ./config.json                                               │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI ROUTER                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Argument Parser                                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐   ││
│  │  │ Path Detection│  │ Options/Flags│  │ Positional Arguments       │   ││
│  │  │ lib new       │  │ --short      │  │ my-package                 │   ││
│  │  └──────────────┘  └──────────────┘  └─────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     Ecosystem Discovery                                  ││
│  │  ┌──────────────────────────────────────────────────────────────────┐   ││
│  │  │  ecosystem.manifest.json  ──►  package.json (client.procedures)  │   ││
│  │  │          ▼                                                        │   ││
│  │  │  Dynamic import ──► Auto-register to PROCEDURE_REGISTRY          │   ││
│  │  └──────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Procedure Execution                                 ││
│  │  ┌─────────────┐                     ┌─────────────────────────────┐    ││
│  │  │   Client    │  ────────────────►  │   Procedure Handler         │    ││
│  │  │   .call()   │  (LocalTransport)   │   (input, ctx) => output    │    ││
│  │  └─────────────┘                     └─────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OUTPUT FORMATTER                                   │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐   │
│   │   text   │  │   json   │  │  table   │  │  streaming (with spinner)│   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Show all available commands
mark --help

# Show help for a command group
mark lib --help

# Show help for a specific command
mark lib new --help

# Create a new package
mark lib new my-package

# Run git commands
mark git status
mark git commit -m "My message"

# File operations
mark fs read ./package.json

# Run pnpm commands
mark pnpm install
mark pnpm add lodash --dev
```

## Command Structure

```
mark <path...> [positional...] [--options...]
```

| Component | Description | Example |
|-----------|-------------|---------|
| `path` | Procedure path segments | `lib new`, `git status` |
| `positional` | Positional arguments | `my-package`, `./file.txt` |
| `options` | Named options with `--` | `--short`, `--recursive` |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help for command |
| `--version`, `-v` | Show CLI version |
| `--verbose`, `-V` | Enable verbose output |
| `--json <json>` | Execute raw procedure reference |

## Ecosystem Discovery

The CLI automatically discovers procedures from all ecosystem packages:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Discovery Flow                                   │
│                                                                         │
│  1. Read ~/git/ecosystem/ecosystem.manifest.json                       │
│                          │                                              │
│                          ▼                                              │
│  2. For each package, read package.json                                │
│     └─► Check for client.procedures field                             │
│                          │                                              │
│                          ▼                                              │
│  3. Dynamic import: await import(pkg.proceduresPath)                   │
│                          │                                              │
│                          ▼                                              │
│  4. Procedures auto-register via PROCEDURE_REGISTRY                    │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

Package declaration:
```json
{
  "client": {
    "procedures": "./dist/register.js"
  }
}
```

## Procedure Metadata

Procedures define CLI behavior via metadata:

```typescript
const myProcedure = defineProcedure({
  path: ["lib", "refresh"],
  input: z.object({
    path: z.string(),
    all: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }),
  handler: async (input, ctx) => { /* ... */ },
  metadata: {
    description: "Refresh a library",
    args: ["path"],              // Positional argument mapping
    shorts: {                    // Short flag mappings
      all: "a",
      dryRun: "d",
    },
    output: "streaming",         // Output format
  },
});
```

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Plain text output (default) |
| `json` | JSON-formatted output |
| `table` | Tabular output |
| `streaming` | Progress spinner with final result |

## Procedure References

Execute raw procedure references via JSON:

```bash
# Execute a procedure reference
mark --json '{"$proc": ["lib", "new"], "input": {"name": "my-package"}}'
```

## Package Ecosystem

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Procedure Packages                                 │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ client-lib  │  │ client-git  │  │ client-fs   │  │ client-pnpm │       │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │       │
│  │ │ lib.*   │ │  │ │ git.*   │ │  │ │ fs.*    │ │  │ │ pnpm.*  │ │       │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│         │                │                │                │               │
│         └────────────────┼────────────────┼────────────────┘               │
│                          ▼                ▼                                 │
│                    ┌──────────────────────────┐                            │
│                    │      client-shell        │                            │
│                    │   (shell.run, exec, which)│                            │
│                    └──────────────────────────┘                            │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

- Node.js >= 20
- pnpm (for package management)

## License

MIT
