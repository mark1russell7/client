/**
 * lib.new procedure
 *
 * Creates a new client package in the workspace, at packages/<name>, with the
 * structure the other client packages have: cue-config files, src/index.ts (which
 * imports src/register.ts), src/register.ts, src/types.ts, the "./register" export and the
 * "client.procedures" field. `mark procedure new` then adds procedures that compile.
 * Uses fs.* and shell.* procedures via ctx.client.call() for all operations.
 *
 * After it, run `pnpm install` and `pnpm build` in the workspace root.
 */

import { join } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibNewInput, LibNewOutput } from "../../types.js";
import { packagesDir, resolveWorkspaceRoot } from "../../workspace.js";

interface ShellRunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

// Importing the package registers its procedures, as in the other client packages
const INDEX_TS = `// Entry point: importing the package registers its procedures
export * from "./register.js";
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

function registerTs(name: string): string {
  return `/**
 * Procedure registration for ${name}
 *
 * Add each procedure of this package to the registerProcedures() array.
 * Scaffold a procedure with: mark procedure new <name> --path packages/${name}
 */

import { registerProcedures } from "@mark1russell7/client";

export function register(): void {
  registerProcedures([]);
}

// Auto-register
register();
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
  const packageName = `@mark1russell7/${input.name}`;

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
        "Would create packages/" + input.name + " with src/index.ts, src/register.ts and src/types.ts",
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
      [join(packagePath, "src", "register.ts"), registerTs(input.name)],
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
      ["fs", "read.json"],
      { path: pkgJsonPath }
    );
    const pkgJson = (pkgReadResult.data ?? {}) as Record<string, unknown>;
    pkgJson["name"] = packageName;
    pkgJson["exports"] = {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./register": { types: "./dist/register.d.ts", import: "./dist/register.js" },
    };
    pkgJson["client"] = { procedures: "./dist/register.js" };
    pkgJson["dependencies"] = {
      ...((pkgJson["dependencies"] as Record<string, string> | undefined) ?? {}),
      "@mark1russell7/client": "workspace:*",
      zod: "^3.24.0",
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
