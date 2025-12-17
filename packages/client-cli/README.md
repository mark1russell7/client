# @mark1russell7/client-cli

CLI operations as RPC procedures. Provides `lib.*` and `config.*` commands.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              client-cli                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  lib.scan   │  │ lib.refresh │  │  lib.new    │  │  lib.audit  │        │
│  │  Discover   │  │  Install +  │  │  Create new │  │  Validate   │        │
│  │  packages   │  │  Build      │  │  package    │  │  all pkgs   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ lib.install │  │ lib.rename  │  │ config.init │  │config.add/rm│        │
│  │  Clone all  │  │  Rename pkg │  │  Init deps  │  │  Features   │        │
│  │  from manifest│ │  across     │  │  .json      │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          DAG Executor                                │   │
│  │   Parallel execution with dependency ordering (Kahn's algorithm)    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Angular Schematics                               │   │
│  │   lib-new, lib-refresh (dry-run, rollback support)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Procedures

### lib.* - Library Management

| Command | Description | Flags |
|---------|-------------|-------|
| `lib.scan` | Scan ~/git for packages | `-r` rootPath |
| `lib.refresh` | Install, build, commit | `-r` recursive, `-a` all, `-f` force, `-d` dryRun |
| `lib.install` | Clone & build ecosystem | `-d` dryRun |
| `lib.new` | Create new package | `-p` preset, `-d` dryRun |
| `lib.rename` | Rename package across codebase | `-d` dryRun |
| `lib.audit` | Validate all packages | `-f` fix |

### config.* - Configuration Management

| Command | Description |
|---------|-------------|
| `config.init` | Initialize dependencies.json |
| `config.add` | Add feature to dependencies |
| `config.remove` | Remove feature |
| `config.generate` | Generate package.json, tsconfig, .gitignore |
| `config.validate` | Validate dependencies.json |

## DAG Execution

Packages are processed in dependency order using a leveled DAG:

```
Level 2:  [app1, app2]         ← Processed last (depend on others)
              │
Level 1:  [client-cli, client-mongo]  ← Middle layer
              │
Level 0:  [client, logger, cue]  ← Processed first (no deps)
```

## Dry-Run Support

All destructive operations support `--dryRun` / `-d`:

```bash
# Preview what lib.refresh would do
mark lib refresh -a -d

# Preview what lib.new would create
mark lib new my-package -d
```

## Integration

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   cli        │────►│  client      │────►│  client-cli  │
│  (entry)     │     │  (RPC core)  │     │  (procedures)│
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     .client-registry.json
                     (auto-discovered)
```
