/**
 * Library Initialization
 *
 * Scaffolds a new library with procedure support.
 * Creates the necessary file structure and configuration.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

export interface InitOptions {
  /** Library name or "." for current directory */
  name: string;
  /** Overwrite existing files */
  force: boolean;
}

// =============================================================================
// Templates
// =============================================================================

function getPackageJsonTemplate(name: string): string {
  return `{
  "name": "${name}",
  "version": "1.0.0",
  "description": "Library with client procedures",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./register": {
      "types": "./dist/register.d.ts",
      "import": "./dist/register.js"
    }
  },
  "client": {
    "procedures": "./dist/register.js"
  },
  "files": [
    "dist",
    "src"
  ],
  "scripts": {
    "build": "tsc -b",
    "clean": "rm -rf dist",
    "watch": "tsc -b --watch",
    "prepare": "npm run build",
    "postinstall": "client announce || true"
  },
  "peerDependencies": {
    "client": "^1.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "client": "^1.0.0",
    "typescript": "^5.7.0",
    "zod": "^3.0.0"
  }
}
`;
}

function getTsconfigTemplate(): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;
}

function getIndexTemplate(name: string): string {
  const moduleName = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return `/**
 * ${name}
 *
 * Export your procedures and types from this file.
 */

// Export procedures
export { ${moduleName}Procedures } from "./procedures/index.js";

// Export individual procedures for direct use
export { exampleProcedure } from "./procedures/index.js";

// Export types if needed
export type { ExampleInput, ExampleOutput } from "./procedures/index.js";
`;
}

function getRegisterTemplate(name: string): string {
  const moduleName = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return `/**
 * Procedure Registration
 *
 * This file is imported as a side-effect to register procedures.
 * The path to this file is declared in package.json under "client.procedures".
 *
 * When another app runs \`npx client discover\`, this file will be
 * automatically imported, causing procedures to be registered.
 */

import { createAndRegister } from "client/procedures";
import { ${moduleName}Procedures } from "./procedures/index.js";

/**
 * Register all procedures from this library.
 * This runs immediately when this file is imported.
 */
export const ${moduleName}Module = createAndRegister("${name}", ${moduleName}Procedures);
`;
}

function getProceduresTemplate(name: string): string {
  const moduleName = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return `/**
 * Procedure Definitions
 *
 * Define your procedures here using defineProcedure().
 */

import { z } from "zod";
import { defineProcedure } from "client/procedures";

// =============================================================================
// Types
// =============================================================================

export const ExampleInputSchema = z.object({
  id: z.string(),
});

export const ExampleOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export type ExampleInput = z.infer<typeof ExampleInputSchema>;
export type ExampleOutput = z.infer<typeof ExampleOutputSchema>;

// =============================================================================
// Procedures
// =============================================================================

/**
 * Example procedure - replace with your actual procedures.
 */
export const exampleProcedure = defineProcedure({
  path: ["${name}", "example", "get"],
  input: ExampleInputSchema,
  output: ExampleOutputSchema,
  metadata: {
    description: "Get an example by ID",
  },
  handler: async (input, ctx) => {
    // Implement your procedure logic here
    // Access storage via ctx.repository?.getStorage() if needed

    return {
      id: input.id,
      name: "Example",
      createdAt: new Date().toISOString(),
    };
  },
});

/**
 * Export all procedures as an array for registration.
 */
export const ${moduleName}Procedures = [
  exampleProcedure,
  // Add more procedures here
];
`;
}

function getGitignoreTemplate(): string {
  return `# Dependencies
node_modules/

# Build output
dist/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# Generated
__generated__/
`;
}

function getReadmeTemplate(name: string): string {
  return `# ${name}

A library with client procedures.

## Installation

\`\`\`bash
npm install ${name}
\`\`\`

## How It Works

This library automatically registers its procedures when installed:

1. The \`postinstall\` script runs \`client announce\`
2. This writes to \`.client-registry.json\` at your project root
3. When you run \`client discover\`, it reads from this registry

This means **zero configuration** for consumers - just install and discover!

## Usage

### In Your App (Consumer)

After installing this library, run discovery to generate imports:

\`\`\`bash
npx client discover
\`\`\`

Then import the generated file in your entry point:

\`\`\`typescript
import "./__generated__/procedures";
\`\`\`

### Manual Registration (Alternative)

\`\`\`typescript
import "${name}/register";
\`\`\`

### Direct Procedure Import

\`\`\`typescript
import { exampleProcedure } from "${name}";
\`\`\`

## Development

\`\`\`bash
# Build
npm run build

# Watch mode
npm run watch
\`\`\`

## License

MIT
`;
}

// =============================================================================
// File Writing
// =============================================================================

async function writeFile(
  filePath: string,
  content: string,
  force: boolean
): Promise<boolean> {
  try {
    // Check if file exists
    await fs.access(filePath);
    if (!force) {
      console.log(`  Skipping (exists): ${path.basename(filePath)}`);
      return false;
    }
    console.log(`  Overwriting: ${path.basename(filePath)}`);
  } catch {
    console.log(`  Creating: ${path.basename(filePath)}`);
  }

  await fs.writeFile(filePath, content, "utf-8");
  return true;
}

// =============================================================================
// Main
// =============================================================================

/**
 * Initialize a new library with procedure support.
 */
export async function init(options: InitOptions): Promise<void> {
  const { name, force } = options;

  // Determine target directory
  const isCurrentDir = name === ".";
  const targetDir = isCurrentDir ? process.cwd() : path.join(process.cwd(), name);
  const packageName = isCurrentDir ? path.basename(process.cwd()) : name;

  console.log(`\nInitializing ${packageName}...`);

  // Create directory structure
  const dirs = [
    targetDir,
    path.join(targetDir, "src"),
    path.join(targetDir, "src", "procedures"),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Write files
  const files: Array<[string, string]> = [
    [path.join(targetDir, "package.json"), getPackageJsonTemplate(packageName)],
    [path.join(targetDir, "tsconfig.json"), getTsconfigTemplate()],
    [path.join(targetDir, "src", "index.ts"), getIndexTemplate(packageName)],
    [path.join(targetDir, "src", "register.ts"), getRegisterTemplate(packageName)],
    [path.join(targetDir, "src", "procedures", "index.ts"), getProceduresTemplate(packageName)],
    [path.join(targetDir, ".gitignore"), getGitignoreTemplate()],
    [path.join(targetDir, "README.md"), getReadmeTemplate(packageName)],
  ];

  for (const [filePath, content] of files) {
    await writeFile(filePath, content, force);
  }

  console.log(`
Done! Next steps:

  ${isCurrentDir ? "" : `cd ${name}`}
  npm install
  npm run build

Your library is ready to define procedures in src/procedures/index.ts

When consumers install your library and run \`npx client discover\`,
your procedures will be automatically discovered and registered.
`);
}
