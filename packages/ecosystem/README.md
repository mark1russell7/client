# @mark1russell7/ecosystem

Central registry and configuration for the mark1russell7 package ecosystem.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ecosystem.manifest.json                             │
│                         (Single Source of Truth)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  packages: { ... }          │  projectTemplate: { files, dirs }             │
│  ↓                          │  ↓                                            │
│  Registry of all repos      │  Standard structure for all packages          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                              │
        ┌───────────┴───────────┐      ┌──────────┴──────────┐
        ▼                       ▼      ▼                      ▼
   lib.install            lib.scan   lib.audit            lib.new
   (clone all)            (discover) (validate all)       (create new)
```

## Package Registry

All packages are registered in `ecosystem.manifest.json`:

| Package | Description |
|---------|-------------|
| `@mark1russell7/client` | Universal RPC client with middleware |
| `@mark1russell7/client-cli` | CLI procedures (lib.*, config.*) |
| `@mark1russell7/client-logger` | Logger procedures |
| `@mark1russell7/client-mongo` | MongoDB procedures |
| `@mark1russell7/client-server` | HTTP/WS server procedures |
| `@mark1russell7/client-sqlite` | SQLite procedures |
| `@mark1russell7/client-splay` | Splay rendering procedures |
| `@mark1russell7/cli` | Main CLI entry point |
| `@mark1russell7/cue` | CUE schemas & cue-config CLI |
| `@mark1russell7/logger` | Standalone logger |
| `@mark1russell7/splay` | Recursive data renderer (core) |
| `@mark1russell7/splay-react` | Splay React bindings |
| `@mark1russell7/docker-mongo` | MongoDB Docker config |
| `@mark1russell7/docker-sqlite` | SQLite Docker config |

## Project Template

Every package must conform to `projectTemplate`:

```
package/
├── src/                    # Source code (required)
├── dist/                   # Build output (created on build)
├── package.json            # Package manifest (required)
├── tsconfig.json           # TypeScript config (required)
├── dependencies.json       # Feature dependencies (required)
└── .gitignore              # Git ignore patterns (required)
```

## Commands

```bash
# Validate all packages against projectTemplate
mark lib audit

# Fix missing files
mark lib audit --fix

# Create new package from template
mark lib new my-package

# Install entire ecosystem
mark lib install

# Scan for packages
mark lib scan
```

## Validation Flow

```
ecosystem.manifest.json
         │
         ├──► lib.audit       → Validates ALL packages against projectTemplate
         │
         ├──► lib.new         → Creates new packages using projectTemplate
         │
         ├──► validate-structure → Validates single package
         │
         └──► CUE schema      → ecosystem/schema.cue validates manifest itself
```
