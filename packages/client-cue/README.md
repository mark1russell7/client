# @mark1russell7/client-cue

CUE-based configuration management as RPC procedures. Initialize, add/remove features, and generate config files.

## Installation

```bash
npm install github:mark1russell7/client-cue#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["cue", "add"], { feature: "vitest" })                  │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             client-cue                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Configuration                                   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐│  │
│  │  │ cue.init │  │ cue.add  │  │cue.remove│  │    cue.generate       ││  │
│  │  │Init deps │  │Add feature│  │Remove    │  │ Generate config files ││  │
│  │  │.json     │  │          │  │feature   │  │ (package.json, etc.)  ││  │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────────────┘│  │
│  │                                                                        │  │
│  │  ┌────────────────────────────────────────────────────────────────┐   │  │
│  │  │                     cue.validate                                │   │  │
│  │  │   Validate dependencies.json against feature manifest          │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           @mark1russell7/cue                             ││
│  │            (Core feature resolution and config generation)               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-cue/register";

const client = new Client({ /* transport */ });

// Initialize configuration with a preset
await client.call(["cue", "init"], {
  preset: "lib",
  cwd: "/path/to/project",
});

// Add a feature
await client.call(["cue", "add"], {
  feature: "vitest",
});

// Generate config files
await client.call(["cue", "generate"], {});
```

## Procedures

| Path | Description |
|------|-------------|
| `cue.init` | Initialize dependencies.json with a preset |
| `cue.add` | Add a feature to dependencies |
| `cue.remove` | Remove a feature from dependencies |
| `cue.generate` | Generate config files from dependencies |
| `cue.validate` | Validate dependencies.json |

### cue.init

Initialize `dependencies.json` with a preset.

```typescript
interface CueInitInput {
  preset?: string;       // Preset name (default: "lib")
  force?: boolean;       // Overwrite existing (default: false)
  cwd?: string;          // Working directory
}

interface CueInitOutput {
  success: boolean;
  preset: string;
  created: string[];     // Files created
  message?: string;
  error?: string;
}
```

**Presets:**
- `lib` - TypeScript library
- `app` - Full application
- `react` - React application
- `node` - Node.js backend

**Example:**
```typescript
await client.call(["cue", "init"], {
  preset: "lib",
  cwd: "/my/project",
});
// Creates dependencies.json with lib features
```

### cue.add

Add a feature to dependencies.json.

```typescript
interface CueAddInput {
  feature: string;       // Feature to add
  cwd?: string;          // Working directory
}

interface CueAddOutput {
  success: boolean;
  feature: string;
  added: boolean;        // false if already present
  message?: string;
  error?: string;
}
```

**Available Features:**
- `node` - Node.js configuration
- `typescript` - TypeScript support
- `vitest` - Vitest testing
- `prettier` - Prettier formatting
- `eslint` - ESLint linting
- `react` - React support
- `client` - Client procedures

**Example:**
```typescript
await client.call(["cue", "add"], {
  feature: "vitest",
});
// Adds vitest and its dependencies to dependencies.json
```

### cue.remove

Remove a feature from dependencies.json.

```typescript
interface CueRemoveInput {
  feature: string;       // Feature to remove
  cwd?: string;          // Working directory
}

interface CueRemoveOutput {
  success: boolean;
  feature: string;
  removed: boolean;      // false if not present
  message?: string;
  error?: string;
}
```

### cue.generate

Generate configuration files from dependencies.json.

```typescript
interface CueGenerateInput {
  cwd?: string;          // Working directory
}

interface CueGenerateOutput {
  success: boolean;
  resolvedFeatures: string[];  // All resolved features
  generated: string[];         // Files generated
  message?: string;
  error?: string;
}
```

**Generated Files:**
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vitest.config.ts` - Vitest configuration
- `.gitignore` - Git ignore patterns
- `.prettierrc` - Prettier configuration

### cue.validate

Validate dependencies.json against the feature manifest.

```typescript
interface CueValidateInput {
  cwd?: string;          // Working directory
}

interface CueValidateOutput {
  success: boolean;
  valid: boolean;
  features: string[];    // Declared features
  errors: string[];      // Validation errors
  message?: string;
}
```

## Feature Dependencies

Features can depend on other features:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Feature Dependency Graph                              │
│                                                                              │
│   vitest ───────────► typescript ───────────► node                          │
│                                                                              │
│   react ────────────► typescript ───────────► node                          │
│        └────────────► vitest                                                 │
│                                                                              │
│   eslint ───────────► node                                                  │
│                                                                              │
│   prettier ─────────► node                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

When you add a feature, its dependencies are automatically included.

## dependencies.json Format

```json
{
  "$schema": "https://mark1russell7.github.io/cue/schema.json",
  "dependencies": [
    "typescript",
    "vitest",
    "prettier"
  ]
}
```

## Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   cue init      │────►│   cue add       │────►│  cue generate   │
│   (preset)      │     │   (features)    │     │  (config files) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
 dependencies.json      Add features to         Generate:
 with preset features   dependencies.json       - package.json
                                                - tsconfig.json
                                                - vitest.config.ts
                                                - etc.
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              client                                          │
│                         (Core RPC framework)                                 │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            client-cue                                        │
│                    (Procedure definitions)                                   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               cue                                            │
│            (Feature resolution, config generation core)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
