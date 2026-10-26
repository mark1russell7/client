/**
 * lib.new procedure
 *
 * Creates a new client package in the workspace, at packages/<name>, with the
 * structure the other client packages have: cue-config files, src/module.ts (the procedures as
 * data), src/register.ts (the only file with a side effect), src/index.ts, src/types.ts, the
 * "./module" and "./register" exports and the "client.procedures" field. Importing the package
 * root registers nothing (ARCHITECTURE-PROPOSALS-2026-10, P9). `mark procedure new` then adds
 * procedures to the module, and they compile.
 * Uses fs.* and shell.* procedures via ctx.client.call() for all operations.
 *
 * After it, run `pnpm install` and `pnpm build` in the workspace root.
 */

import { join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import type { LibNewInput, LibNewOutput } from "../../types.js";
import { packagesDir, resolveWorkspaceRoot } from "../../workspace.js";

interface ShellRunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

// The root registers nothing: `import "<package>/register"` or `createRegistry()` registers the procedures
const INDEX_TS = `// The root registers nothing: import "<package>/register", or give the module to createRegistry()
export * from "./module.js";
export * from "./types.js";
`;

// \`mark procedure new\` appends the types of each procedure, and adds the zod import then.
// An unused import here would fail noUnusedLocals (deep dive CLI-13).
const TYPES_TS = `/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here.
 */

export {};
`;

/** The names of a package folder in code: "my-package" gives "myPackage" and "MyPackage". */
function codeNames(name: string): { camel: string; pascal: string } {
  const pascal = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return { camel: pascal[0]!.toLowerCase() + pascal.slice(1), pascal };
}

function moduleTs(name: string, packageName: string): string {
  const { camel, pascal } = codeNames(name);
  return `/**
 * The procedures of ${packageName} as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/${name}
 */

import { defineModule, registerModules, PROCEDURE_REGISTRY, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";

export const ${camel}Module: ProcedureModule = defineModule("${packageName}", []);

export default ${camel}Module;

/**
 * This function registers the procedures of ${packageName} in a registry. The default is the
 * global registry.
 */
export function register${pascal}Procedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [${camel}Module]);
}
`;
}

function registerTs(name: string, packageName: string): string {
  const { pascal } = codeNames(name);
  return `/**
 * Importing this file registers the procedures of ${packageName} in the global registry:
 * \`import "${packageName}/register"\`. The package root registers nothing.
 */

import { register${pascal}Procedures } from "./module.js";

export * from "./module.js";

register${pascal}Procedures();
`;
}

/**
 * Run the workspace's cue-config CLI (not npx: a new package has no node_modules,
 * and npx would download an unrelated package from the registry).
 */
async function runCueConfig(
  cueCli: string,
  args: string[],
  cwd: string,
  ctx: ProcedureContext
): Promise<void> {
  const result = await ctx.client.call<
    { command: string; args: string[]; cwd: string },
    ShellRunOutput
  >(["shell", "run"], { command: process.execPath, args: [cueCli, ...args], cwd });
  if (!result.success) {
    throw new Error(`cue-config ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
  }
}

/**
 * Create a new client package in the workspace
 */
export async function libNew(input: LibNewInput, ctx: ProcedureContext): Promise<LibNewOutput> {
  const operations: string[] = [];
  const created: string[] = [];
  const errors: string[] = [];
  const packageName = `@procedures/${input.name}`;

  let rootPath: string;
  try {
    rootPath = resolveWorkspaceRoot(input.rootPath);
  } catch (error) {
    return {
      success: false,
      packageName,
      packagePath: "",
      created: [],
      operations: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  const packagePath = join(packagesDir(rootPath), input.name);
  const cueCli = join(rootPath, "node_modules", "@mark1russell7", "cue", "dist", "cli.js");

  // Check if package already exists
  const existsResult = await ctx.client.call<{ path: string }, { exists: boolean; path: string }>(
    ["fs", "exists"],
    { path: packagePath }
  );
  if (existsResult.exists) {
    return {
      success: false,
      packageName,
      packagePath,
      created: [],
      operations: [],
      errors: [`Package directory already exists: ${packagePath}`],
    };
  }

  const files = [
    join(packagePath, "src", "index.ts"),
    join(packagePath, "src", "module.ts"),
    join(packagePath, "src", "register.ts"),
    join(packagePath, "src", "types.ts"),
    join(packagePath, "dependencies.json"),
    join(packagePath, "package.json"),
    join(packagePath, "tsconfig.json"),
    join(packagePath, ".gitignore"),
  ];

  if (input.dryRun) {
    return {
      success: true,
      packageName,
      packagePath,
      created: [`${packagePath}/`, `${join(packagePath, "src")}/`, ...files],
      operations: [
        "Would create packages/" + input.name + " with src/index.ts, src/module.ts, src/register.ts and src/types.ts",
        `Would run cue-config init --preset ${input.preset}`,
        "Would run cue-config generate",
        `Would set the package name to ${packageName}, the exports, client.procedures and the client dependency`,
        "Then run pnpm install and pnpm build in the workspace root",
      ],
      errors: [],
    };
  }

  try {
    // Step 1: Create the folders and the source files
    operations.push("Creating directory structure");
    await ctx.client.call<{ path: string; recursive?: boolean }, { path: string; created: boolean }>(
      ["fs", "mkdir"],
      { path: join(packagePath, "src"), recursive: true }
    );
    created.push(`${packagePath}/`, `${join(packagePath, "src")}/`);

    for (const [file, content] of [
      [join(packagePath, "src", "index.ts"), INDEX_TS],
      [join(packagePath, "src", "module.ts"), moduleTs(input.name, packageName)],
      [join(packagePath, "src", "register.ts"), registerTs(input.name, packageName)],
      [join(packagePath, "src", "types.ts"), TYPES_TS],
    ] as const) {
      await ctx.client.call<{ path: string; content: string }, { path: string; bytesWritten: number }>(
        ["fs", "write"],
        { path: file, content }
      );
      created.push(file);
    }

    // Step 2: cue-config init and generate (dependencies.json, package.json, tsconfig.json, .gitignore)
    operations.push(`Running cue-config init --preset ${input.preset}`);
    await runCueConfig(cueCli, ["init", "--preset", input.preset, "--force"], packagePath, ctx);
    created.push(join(packagePath, "dependencies.json"));

    operations.push("Running cue-config generate");
    await runCueConfig(cueCli, ["generate"], packagePath, ctx);
    created.push(join(packagePath, "package.json"), join(packagePath, "tsconfig.json"), join(packagePath, ".gitignore"));

    // Step 3: cue-config writes the CUE default name ("unnamed") and no client fields.
    // Set what a client package needs (see documentation/BUGS-2026-07.md, C5).
    operations.push("Setting the package fields");
    const pkgJsonPath = join(packagePath, "package.json");
    const pkgReadResult = await ctx.client.call<{ path: string }, { path: string; data: unknown }>(
      ["fs", "read", "json"],
      { path: pkgJsonPath }
    );
    const pkgJson = (pkgReadResult.data ?? {}) as Record<string, unknown>;
    pkgJson["name"] = packageName;
    pkgJson["exports"] = {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./module": { types: "./dist/module.d.ts", import: "./dist/module.js" },
      "./register": { types: "./dist/register.d.ts", import: "./dist/register.js" },
    };
    // Only the register entry has a side effect, so a bundler can drop the rest
    pkgJson["sideEffects"] = ["./dist/register.js"];
    pkgJson["client"] = { procedures: "./dist/register.js" };
    pkgJson["dependencies"] = {
      ...((pkgJson["dependencies"] as Record<string, string> | undefined) ?? {}),
      "@procedures/client": "workspace:*",
      zod: "^4.6.5",
    };
    await ctx.client.call<{ path: string; content: string }, { path: string; bytesWritten: number }>(
      ["fs", "write"],
      { path: pkgJsonPath, content: JSON.stringify(pkgJson, null, 2) + "\n" }
    );
    operations.push(`Created ${packageName}. Next: run pnpm install and pnpm build in ${rootPath}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    success: errors.length === 0,
    packageName,
    packagePath,
    created,
    operations,
    errors,
  };
}
