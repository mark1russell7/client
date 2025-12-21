# @mark1russell7/scaffold

Schema-driven scaffolding system with Angular Schematics and ts-morph.

## Installation

```bash
npm install github:mark1russell7/scaffold#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              scaffold                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           REPO_SCHEMA                                    ││
│  │                                                                          ││
│  │   Defines the structure of an ecosystem package:                        ││
│  │                                                                          ││
│  │   ├── src/                                                              ││
│  │   │   ├── index.ts         [generator: template]                        ││
│  │   │   ├── register.ts      [generator: register]                        ││
│  │   │   └── procedures/      [optional by feature]                        ││
│  │   ├── package.json         [generator: cue]                             ││
│  │   ├── tsconfig.json        [generator: cue]                             ││
│  │   ├── vitest.config.ts     [generator: vitest]                          ││
│  │   └── ...                                                               ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Generators                                       ││
│  │                                                                          ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐││
│  │  │     cue     │  │  template   │  │   vitest    │  │    register     │││
│  │  │ Run cue-    │  │ Render file │  │ Generate    │  │ Generate        │││
│  │  │ config cmds │  │ templates   │  │ vitest cfg  │  │ register.ts     │││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │                      ts-morph Generator                          │    ││
│  │  │   Programmatic TypeScript AST manipulation                       │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Angular Schematics                                ││
│  │                                                                          ││
│  │   lib-new      - Create new package with full scaffolding               ││
│  │   lib-refresh  - Refresh existing package structure                      ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          Features                                        ││
│  │                                                                          ││
│  │   resolveFeatures() - Resolve feature dependencies                      ││
│  │   isFeatureActive() - Check if feature is enabled                       ││
│  │   getPresets()      - Get available presets                             ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import {
  REPO_SCHEMA,
  walkSchema,
  getGenerator,
  createGeneratorRegistry,
  resolveFeatures,
} from "@mark1russell7/scaffold";

// Walk the schema to get all paths
const files = walkSchema(REPO_SCHEMA, (node, path) => ({
  path,
  generator: node.generator,
}));

// Resolve features for a preset
const features = resolveFeatures(["typescript", "vitest"]);
// ["node", "typescript", "vitest"]

// Get a generator
const cueGen = getGenerator("cue");
await cueGen(context);
```

## Schema System

### REPO_SCHEMA

Defines the structure of an ecosystem package:

```typescript
import { REPO_SCHEMA, FSType, Generator, Feature } from "@mark1russell7/scaffold";

// Schema structure
const schema = {
  $type: FSType.Directory,
  children: {
    "src": {
      $type: FSType.Directory,
      children: {
        "index.ts": {
          $type: FSType.File,
          generator: Generator.IndexTs,
        },
        "register.ts": {
          $type: FSType.File,
          generator: Generator.RegisterTs,
          feature: Feature.Client,
        },
      },
    },
    "package.json": {
      $type: FSType.File,
      generator: Generator.Cue,
    },
  },
};
```

### Schema Types

```typescript
enum FSType {
  File = "file",
  Directory = "directory",
}

enum Generator {
  Cue = "cue",
  Template = "template",
  IndexTs = "index-ts",
  RegisterTs = "register-ts",
  Vitest = "vitest",
  TsMorph = "ts-morph",
}

enum Feature {
  Node = "node",
  TypeScript = "typescript",
  Vitest = "vitest",
  Client = "client",
  React = "react",
}
```

### Walking the Schema

```typescript
import { walkSchema, getFilePaths, getDirectoryPaths } from "@mark1russell7/scaffold";

// Walk all nodes
walkSchema(REPO_SCHEMA, (node, path, parent) => {
  console.log(`${path}: ${node.$type}`);
});

// Get all file paths
const files = getFilePaths(REPO_SCHEMA);
// ["src/index.ts", "src/register.ts", "package.json", ...]

// Get all directory paths
const dirs = getDirectoryPaths(REPO_SCHEMA);
// ["src", "src/procedures", ...]
```

## Generators

### cue Generator

Runs cue-config commands:

```typescript
import { cueGenerator, runCueConfigInit, runCueConfigGenerate } from "@mark1russell7/scaffold";

// Initialize cue config
await runCueConfigInit({ cwd: "/path/to/package", preset: "lib" });

// Generate files
await runCueConfigGenerate({ cwd: "/path/to/package" });
```

### template Generator

Render file templates:

```typescript
import { templateGenerator, registerTemplate } from "@mark1russell7/scaffold";

// Register a template
registerTemplate("my-template", (context) => {
  return `// Generated file
export const name = "${context.packageName}";
`;
});

// Generate file
const content = templateGenerator("my-template", {
  packageName: "my-package",
});
```

### vitest Generator

Generate vitest configuration:

```typescript
import { generateVitestConfig } from "@mark1russell7/scaffold";

const config = generateVitestConfig({
  packageName: "my-package",
  coverage: true,
});
```

### ts-morph Generator

Programmatic TypeScript manipulation:

```typescript
import { generateIndexTs, generateRegisterTs } from "@mark1russell7/scaffold";

// Generate index.ts with exports
const indexTs = generateIndexTs({
  exports: ["./types", "./utils", "./procedures"],
});

// Generate register.ts with procedure imports
const registerTs = generateRegisterTs({
  procedures: ["./procedures/user", "./procedures/auth"],
});
```

## Features System

### Resolving Features

Features can depend on other features:

```typescript
import { resolveFeatures, isFeatureActive } from "@mark1russell7/scaffold";

// Resolve all dependencies
const features = resolveFeatures(["vitest"]);
// ["node", "typescript", "vitest"]

// Check if feature is active
if (isFeatureActive(features, "typescript")) {
  // Include TypeScript-specific files
}
```

### Presets

Presets are named feature sets:

```typescript
import { getPresets, getPresetFeatures } from "@mark1russell7/scaffold";

// Get all preset names
const presets = getPresets();
// ["lib", "app", "react", "node"]

// Get features for a preset
const libFeatures = getPresetFeatures("lib");
// ["node", "typescript", "vitest", "prettier"]
```

## Angular Schematics

### lib-new

Create a new package:

```bash
npx ng generate @mark1russell7/scaffold:lib-new --name=my-package --preset=lib
```

### lib-refresh

Refresh package structure:

```bash
npx ng generate @mark1russell7/scaffold:lib-refresh --path=/path/to/package
```

## Generator Registry

Register and validate generators:

```typescript
import { createGeneratorRegistry, validateRegistry } from "@mark1russell7/scaffold";

const registry = createGeneratorRegistry();

registry.register("custom", async (context) => {
  return `// Custom generated content`;
});

// Validate all generators are registered
const missing = validateRegistry(REPO_SCHEMA, registry);
if (missing.length > 0) {
  throw new Error(`Missing generators: ${missing.join(", ")}`);
}
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              scaffold                                        │
│                    (Schema + Generators + Schematics)                        │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │      cue        │   │    ts-morph     │   │ @angular-devkit │
     │ (Feature system)│   │ (AST generation)│   │   /schematics   │
     └─────────────────┘   └─────────────────┘   └─────────────────┘
```

## License

MIT
